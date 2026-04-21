#!/usr/bin/env python3
"""
run_benchmark.py — Harness benchmark Phase 2 Lexa IA
Mesure qualité + performance d'un modèle vLLM contre le dataset fiscal CH.

Usage:
  python run_benchmark.py --model apolo13x/Qwen3.5-35B-A3B-NVFP4
  python run_benchmark.py --model Qwen/Qwen2.5-7B-Instruct --endpoint http://dgx:8000
  python run_benchmark.py --model nvidia/Llama-3.1-8B-NVFP4 --categories rag-fiscal classifier-kafer
  python run_benchmark.py --model MODEL --judge-model apolo13x/Qwen3.5-35B-A3B-NVFP4 --judge-endpoint http://dgx:8000

NOTE: Ce script ne lance PAS les benchmarks automatiquement.
      Il nécessite --run pour exécuter réellement les appels.
      Sans --run, il valide le dataset et affiche un plan d'exécution.
"""

import argparse
import json
import os
import re
import sys
import time
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Strip thinking blocks (Qwen3.5-MoE émettent <think>...</think> dans delta.content)
THINK_RE = re.compile(r'<think>.*?</think>', re.DOTALL | re.IGNORECASE)

# ── Dépendances optionnelles (installées dans le venv DGX) ───────────────────
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    print("[warn] 'requests' not installed — dry-run only. pip install requests")

try:
    import pynvml
    pynvml.nvmlInit()
    HAS_NVML = True
except Exception:
    HAS_NVML = False

# ── Chemins ───────────────────────────────────────────────────────────────────
HARNESS_DIR = Path(__file__).parent
DATASET_DIR = HARNESS_DIR.parent / "dataset"
REPORTS_DIR = HARNESS_DIR.parent / "reports"

DATASET_FILES = {
    "rag-fiscal":      DATASET_DIR / "rag-fiscal.json",
    "json-wizard":     DATASET_DIR / "json-wizard.json",
    "chat-streaming":  DATASET_DIR / "chat-streaming.json",
    "classifier-kafer": DATASET_DIR / "classifier-kafer.json",
}

# ── Seuils de qualité (passer/échouer) ───────────────────────────────────────
QUALITY_THRESHOLDS = {
    "rag-fiscal":      0.75,   # 75% des contains doivent matcher
    "json-wizard":     0.90,   # JSON valide + contenu correct
    "chat-streaming":  0.70,   # réponse cohérente avec le contexte
    "classifier-kafer": 0.85,  # compte Käfer correct
}

# ── Performance thresholds (basés sur baseline 35B-A3B) ──────────────────────
PERF_THRESHOLDS = {
    "ttft_p50_max_ms":    2000,   # TTFT médian max acceptable: 2s
    "tokens_per_sec_min": 20,     # tokens/s min acceptable en génération
    "e2e_p95_max_ms":     30000,  # latence end-to-end p95 max: 30s
}


# ── Helpers NVML (VRAM) ───────────────────────────────────────────────────────

def get_vram_mb(device_index: int = 0) -> Optional[float]:
    """Retourne la VRAM utilisée en MiB (None si pynvml indisponible)."""
    if not HAS_NVML:
        return None
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(device_index)
        info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        return info.used / (1024 * 1024)
    except Exception:
        return None


# ── Appel vLLM (streaming) ────────────────────────────────────────────────────

def call_vllm_streaming(
    endpoint: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.1,
    timeout: int = 120,
) -> dict:
    """
    Appel vLLM /v1/chat/completions en streaming SSE.
    Retourne: {text, ttft_ms, total_ms, tokens_generated, tokens_per_sec, error}
    """
    if not HAS_REQUESTS:
        return {"error": "requests not installed", "text": "", "ttft_ms": 0, "total_ms": 0}

    url = f"{endpoint.rstrip('/')}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
        # Désactive explicitement le thinking mode pour éviter que le modèle émette
        # son raisonnement ("Thinking Process: ...") en clair dans delta.content.
        # Sans ce flag, Qwen3.5-MoE avec --reasoning-parser qwen3 écrit son raisonnement
        # en texte libre AVANT la réponse → scorer rate les mots-clés.
        # Observation baseline : 1.7% accuracy avec thinking, >80% attendu sans.
        "chat_template_kwargs": {"enable_thinking": False},
    }

    t_start = time.perf_counter()
    ttft_ms = None          # Fix2: TTFT total (premier token, tous types confondus)
    ttft_response_ms = None # Fix2: TTFT réponse finale (premier token post-thinking)
    text = ""
    tokens_generated = 0

    # Fix2: état pour détecter les bornes <think>/</think> dans delta.content
    in_think_block = False

    try:
        with requests.post(url, json=payload, stream=True, timeout=timeout) as resp:
            resp.raise_for_status()
            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                delta = chunk.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content", "")
                reasoning = delta.get("reasoning_content", "")

                # Mesurer TTFT dès le premier token (thinking ou content) — latence brute
                if (content or reasoning) and ttft_ms is None:
                    ttft_ms = (time.perf_counter() - t_start) * 1000

                # N'accumuler que delta.content (la réponse finale, pas le reasoning_content)
                if content:
                    text += content
                    tokens_generated += 1  # approximation 1 token ≈ 1 chunk SSE

                    # Fix2: suivi état thinking dans delta.content pour TTFT response
                    # Détecter ouverture/fermeture du bloc thinking
                    if "<think>" in content.lower():
                        in_think_block = True
                    if "</think>" in content.lower():
                        in_think_block = False
                        # Le prochain token de contenu sera la réponse finale
                    elif not in_think_block and ttft_response_ms is None:
                        # Pas dans un bloc thinking ET pas de thinking détecté : c'est du contenu réel
                        # Vérifier qu'on n'est pas au début d'un bloc thinking potentiel
                        if not content.lower().strip().startswith("<think"):
                            ttft_response_ms = (time.perf_counter() - t_start) * 1000

                elif reasoning:
                    tokens_generated += 1  # compter les tokens reasoning pour tok/s

        # Fix2: si ttft_response_ms jamais fixé (pas de thinking), = ttft total
        if ttft_response_ms is None:
            ttft_response_ms = ttft_ms

        total_ms = (time.perf_counter() - t_start) * 1000
        generation_ms = total_ms - (ttft_ms or 0)
        tokens_per_sec = (tokens_generated / generation_ms * 1000) if generation_ms > 0 else 0

        # Fix1: strip des blocs thinking AVANT scoring
        final_text = THINK_RE.sub('', text).strip()

        return {
            "text": final_text,           # Fix4: text = post-strip (utilisé pour scoring)
            "raw_text": text,             # Fix4: texte original avec balises thinking
            "final_text": final_text,     # Fix4: alias explicite post-strip
            "ttft_ms": round(ttft_ms or 0, 1),
            "ttft_total_ms": round(ttft_ms or 0, 1),             # Fix4: TTFT brut
            "ttft_response_ms": round(ttft_response_ms or 0, 1), # Fix4: TTFT réponse
            "total_ms": round(total_ms, 1),
            "tokens_generated": tokens_generated,
            "tokens_per_sec": round(tokens_per_sec, 1),
            "error": None,
        }
    except Exception as exc:
        return {
            "text": "",
            "raw_text": "",
            "final_text": "",
            "ttft_ms": 0,
            "ttft_total_ms": 0,
            "ttft_response_ms": 0,
            "total_ms": round((time.perf_counter() - t_start) * 1000, 1),
            "tokens_generated": 0,
            "tokens_per_sec": 0,
            "error": str(exc),
        }


# ── Évaluation accuracy ───────────────────────────────────────────────────────

def eval_contains(text: str, expected: dict) -> float:
    """Vérifie les sous-chaînes 'contains'. Retourne fraction de matches."""
    contains_list = expected.get("contains", [])
    if not contains_list:
        return 1.0
    hits = sum(1 for c in contains_list if c.lower() in text.lower())
    return hits / len(contains_list)


def eval_regex(text: str, expected: dict) -> bool:
    """Vérifie le regex. True si match ou pas de regex défini."""
    regex_pattern = expected.get("regex")
    if not regex_pattern:
        return True
    try:
        return bool(re.search(regex_pattern, text, re.IGNORECASE | re.DOTALL))
    except re.error:
        return False


def eval_must_not_contain(text: str, expected: dict) -> bool:
    """Vérifie qu'aucun terme interdit n'apparaît."""
    forbidden = expected.get("must_not_contain", [])
    for term in forbidden:
        if term.lower() in text.lower():
            return False
    return True


def eval_json_wizard(text: str, expected: dict) -> float:
    """Évaluation spéciale pour les JSON wizard: parse + contains."""
    # 1. Extraire le JSON du texte (peut être entouré de markdown)
    cleaned = text.strip()
    # Nettoyer les blocs markdown
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^```\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'```\s*$', '', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()

    # Trouver les bornes JSON
    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start == -1 or end == -1:
        return 0.0  # Pas de JSON trouvé

    json_slice = cleaned[start:end + 1]
    try:
        parsed = json.loads(json_slice)
    except json.JSONDecodeError:
        return 0.3  # JSON invalide = score partiel minimal

    # 2. Vérifier les contains dans le JSON sérialisé
    json_str = json.dumps(parsed, ensure_ascii=False)
    contains_score = eval_contains(json_str, expected)

    # 3. Vérifier les champs de comptes Käfer si présents
    debit_prefix = expected.get("debit_account_starts_with")
    credit_prefix = expected.get("credit_account_starts_with")
    account_score = 1.0
    account_checks = 0

    if debit_prefix:
        debit = str(parsed.get("debit_account", ""))
        account_checks += 1
        if not debit.startswith(debit_prefix):
            account_score -= 0.5

    if credit_prefix:
        credit = str(parsed.get("credit_account", ""))
        account_checks += 1
        if not credit.startswith(credit_prefix):
            account_score -= 0.5

    if account_checks > 0:
        return (contains_score * 0.4 + account_score * 0.6)
    return contains_score


def eval_classifier(text: str, expected: dict) -> float:
    """Évaluation pour la classification Käfer."""
    return eval_json_wizard(text, expected)  # même logique


def evaluate_case(case: dict, model_response: str) -> dict:
    """
    Évalue la réponse d'un modèle pour un cas de test.
    Retourne: {score, contains_score, regex_ok, must_not_ok, details}
    """
    expected = case.get("expected", {})
    category = case.get("category", "")

    # Score spécialisé par catégorie
    if category in ("json-wizard",):
        score = eval_json_wizard(model_response, expected)
        regex_ok = eval_regex(model_response, expected)
        must_not_ok = eval_must_not_contain(model_response, expected)
    elif category == "classifier-kafer":
        score = eval_classifier(model_response, expected)
        regex_ok = True
        must_not_ok = eval_must_not_contain(model_response, expected)
    else:
        contains_score = eval_contains(model_response, expected)
        regex_ok = eval_regex(model_response, expected)
        must_not_ok = eval_must_not_contain(model_response, expected)
        # Score combiné
        score = contains_score
        if not regex_ok:
            score *= 0.7
        if not must_not_ok:
            score *= 0.5

    pass_threshold = QUALITY_THRESHOLDS.get(category, 0.75)
    return {
        "score": round(score, 3),
        "pass": score >= pass_threshold,
        "regex_ok": regex_ok,
        "must_not_ok": must_not_ok,
        "threshold": pass_threshold,
    }


# ── LLM-as-judge (optionnel) ──────────────────────────────────────────────────

def llm_judge(
    case: dict,
    model_response: str,
    judge_endpoint: str,
    judge_model: str,
) -> dict:
    """
    Utilise un LLM pour évaluer la qualité d'une réponse.
    Retourne: {score_0_10, reasoning, error}
    """
    judge_criteria = case.get("expected", {}).get("judge_criteria", "")
    if not judge_criteria:
        return {"score_0_10": None, "reasoning": "no criteria", "error": None}

    system_prompt = """Tu es un évaluateur de qualité pour un assistant fiscal suisse.
Tu dois évaluer la réponse d'un modèle selon les critères fournis.
Réponds UNIQUEMENT en JSON: {"score": <0-10>, "reasoning": "<1-2 phrases>"}
- 0-3: Réponse incorrecte ou dangereusement erronée
- 4-6: Réponse partielle ou approximative
- 7-8: Réponse correcte mais incomplète
- 9-10: Réponse exacte, complète, avec citations correctes"""

    user_prompt = f"""CRITÈRES D'ÉVALUATION: {judge_criteria}

RÉPONSE DU MODÈLE:
{model_response[:1500]}

JSON d'évaluation:"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    result = call_vllm_streaming(
        endpoint=judge_endpoint,
        model=judge_model,
        messages=messages,
        max_tokens=150,
        temperature=0.0,
    )

    if result.get("error"):
        return {"score_0_10": None, "reasoning": result["error"], "error": result["error"]}

    try:
        text = result["text"].strip()
        text = re.sub(r'^```json\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'```\s*$', '', text, flags=re.IGNORECASE)
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            parsed = json.loads(text[start:end + 1])
            return {
                "score_0_10": parsed.get("score"),
                "reasoning": parsed.get("reasoning", ""),
                "error": None,
            }
    except (json.JSONDecodeError, KeyError):
        pass

    return {"score_0_10": None, "reasoning": result["text"][:200], "error": "parse failed"}


# ── Chargement dataset ────────────────────────────────────────────────────────

def load_dataset(categories: list[str]) -> list[dict]:
    """Charge les cas de test pour les catégories demandées."""
    cases = []
    for cat in categories:
        path = DATASET_FILES.get(cat)
        if not path or not path.exists():
            print(f"[warn] Dataset '{cat}' non trouvé: {path}")
            continue
        with open(path, encoding="utf-8") as f:
            cat_cases = json.load(f)
        cases.extend(cat_cases)
        print(f"[info] Chargé '{cat}': {len(cat_cases)} cas")
    return cases


def build_messages(case: dict) -> list[dict]:
    """Construit la liste de messages pour un cas (format OpenAI)."""
    category = case.get("category", "")
    turns = case.get("turns")

    if turns:
        # Format chat multi-tour
        messages = []
        for turn in turns:
            role = turn["role"]
            content = turn["content"]
            if content == "__PREVIOUS_RESPONSE__":
                # Placeholder pour injection de la réponse précédente
                # En mode benchmark séquentiel, on laisse vide avec note
                content = "[réponse précédente non disponible en mode batch]"
            messages.append({"role": role, "content": content})
        return messages
    else:
        # Format classique system + user
        inp = case.get("input", {})
        messages = []
        system = inp.get("system")
        if system:
            messages.append({"role": "system", "content": system})

        user_content = inp.get("user", "")
        context_chunks = inp.get("context_chunks", [])
        if context_chunks:
            context_str = "\n\n".join(
                f"[Chunk {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks)
            )
            user_content = f"CONTEXTE:\n{context_str}\n\n{user_content}"

        messages.append({"role": "user", "content": user_content})
        return messages


# ── Statistiques percentiles ──────────────────────────────────────────────────

def percentile(data: list[float], p: int) -> float:
    """Calcule le p-ième percentile d'une liste."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    index = (p / 100) * (len(sorted_data) - 1)
    lower = int(index)
    upper = lower + 1
    if upper >= len(sorted_data):
        return sorted_data[-1]
    frac = index - lower
    return sorted_data[lower] * (1 - frac) + sorted_data[upper] * frac


# ── Rapport markdown ──────────────────────────────────────────────────────────

def generate_report(
    model: str,
    endpoint: str,
    results: list[dict],
    run_date: str,
    vram_before_mb: Optional[float],
    vram_after_mb: Optional[float],
) -> str:
    """Génère le rapport markdown standardisé."""
    lines = [
        f"# Rapport Benchmark Phase 2 — {model}",
        f"",
        f"**Date** : {run_date}  ",
        f"**Modèle** : `{model}`  ",
        f"**Endpoint** : `{endpoint}`  ",
        f"**Total cas** : {len(results)}  ",
        f"",
    ]

    if vram_before_mb is not None:
        vram_peak = vram_after_mb or 0
        lines += [
            f"**VRAM avant** : {vram_before_mb:.0f} MiB  ",
            f"**VRAM après** : {vram_peak:.0f} MiB  ",
            f"",
        ]

    # Regrouper par catégorie
    by_cat: dict[str, list[dict]] = {}
    for r in results:
        cat = r.get("category", "unknown")
        by_cat.setdefault(cat, []).append(r)

    # Tableau récapitulatif
    lines += [
        "## Résultats par catégorie",
        "",
        "| Catégorie | N | Accuracy | TTFT p50 (ms) | tokens/s p50 | Latence E2E p50 (ms) | Latence E2E p95 (ms) | Pass/Fail |",
        "|-----------|---|----------|---------------|--------------|----------------------|----------------------|-----------|",
    ]

    global_pass = True
    for cat, cat_results in sorted(by_cat.items()):
        n = len(cat_results)
        passed = [r for r in cat_results if r.get("eval", {}).get("pass", False)]
        accuracy = len(passed) / n if n > 0 else 0.0

        ttft_list = [r["perf"]["ttft_ms"] for r in cat_results if r.get("perf", {}).get("ttft_ms", 0) > 0]
        tps_list = [r["perf"]["tokens_per_sec"] for r in cat_results if r.get("perf", {}).get("tokens_per_sec", 0) > 0]
        e2e_list = [r["perf"]["total_ms"] for r in cat_results if r.get("perf", {}).get("total_ms", 0) > 0]

        ttft_p50 = f"{percentile(ttft_list, 50):.0f}" if ttft_list else "N/A"
        tps_p50 = f"{percentile(tps_list, 50):.1f}" if tps_list else "N/A"
        e2e_p50 = f"{percentile(e2e_list, 50):.0f}" if e2e_list else "N/A"
        e2e_p95 = f"{percentile(e2e_list, 95):.0f}" if e2e_list else "N/A"

        threshold = QUALITY_THRESHOLDS.get(cat, 0.75)
        cat_pass = accuracy >= threshold
        if not cat_pass:
            global_pass = False
        pass_str = "✅ PASS" if cat_pass else "❌ FAIL"

        lines.append(
            f"| {cat} | {n} | {accuracy:.0%} | {ttft_p50} | {tps_p50} | {e2e_p50} | {e2e_p95} | {pass_str} |"
        )

    # Résumé global
    total_passed = sum(1 for r in results if r.get("eval", {}).get("pass", False))
    global_accuracy = total_passed / len(results) if results else 0.0
    lines += [
        "",
        "## Résumé global",
        "",
        f"- **Accuracy globale** : {global_accuracy:.1%} ({total_passed}/{len(results)})",
        f"- **Verdict** : {'✅ PASS — aucune baisse de qualité détectée' if global_pass else '❌ FAIL — baisse de qualité détectée, NE PAS déployer'}",
        "",
    ]

    # Détails des cas échoués
    failed = [r for r in results if not r.get("eval", {}).get("pass", False)]
    if failed:
        lines += [
            "## Cas échoués",
            "",
            "| ID | Catégorie | Score | Seuil | Erreur |",
            "|----|-----------|-------|-------|--------|",
        ]
        for r in failed[:20]:  # Limiter à 20 pour lisibilité
            score = r.get("eval", {}).get("score", 0)
            threshold = r.get("eval", {}).get("threshold", 0)
            error = r.get("error") or r.get("eval", {}).get("details", "")
            lines.append(f"| {r['id']} | {r['category']} | {score:.2f} | {threshold:.2f} | {str(error)[:80]} |")
        lines.append("")

    # Seuils de performance
    all_ttft = [r["perf"]["ttft_ms"] for r in results if r.get("perf", {}).get("ttft_ms", 0) > 0]
    all_tps = [r["perf"]["tokens_per_sec"] for r in results if r.get("perf", {}).get("tokens_per_sec", 0) > 0]
    all_e2e = [r["perf"]["total_ms"] for r in results if r.get("perf", {}).get("total_ms", 0) > 0]

    lines += [
        "## Seuils de performance",
        "",
        f"| Métrique | Valeur mesurée | Seuil | Status |",
        f"|----------|----------------|-------|--------|",
    ]
    if all_ttft:
        ttft_val = percentile(all_ttft, 50)
        seuil = PERF_THRESHOLDS["ttft_p50_max_ms"]
        ok = "✅" if ttft_val <= seuil else "⚠️"
        lines.append(f"| TTFT p50 | {ttft_val:.0f} ms | ≤ {seuil} ms | {ok} |")
    if all_tps:
        tps_val = percentile(all_tps, 50)
        seuil = PERF_THRESHOLDS["tokens_per_sec_min"]
        ok = "✅" if tps_val >= seuil else "⚠️"
        lines.append(f"| tokens/s p50 | {tps_val:.1f} | ≥ {seuil} | {ok} |")
    if all_e2e:
        e2e_val = percentile(all_e2e, 95)
        seuil = PERF_THRESHOLDS["e2e_p95_max_ms"]
        ok = "✅" if e2e_val <= seuil else "⚠️"
        lines.append(f"| Latence E2E p95 | {e2e_val:.0f} ms | ≤ {seuil} ms | {ok} |")

    lines.append("")
    return "\n".join(lines)


# ── Boucle principale ─────────────────────────────────────────────────────────

def run_benchmark(args: argparse.Namespace) -> int:
    """Exécute le benchmark. Retourne 0 si PASS, 1 si FAIL."""

    print(f"\n{'='*60}")
    print(f" Lexa Phase 2 Benchmark Harness")
    print(f"{'='*60}")
    print(f" Modèle : {args.model}")
    print(f" Endpoint : {args.endpoint}")
    print(f" Catégories : {', '.join(args.categories)}")
    print(f" Mode : {'DRY-RUN (validation uniquement)' if args.dry_run else 'EXECUTION'}")
    print(f"{'='*60}\n")

    # Charger le dataset
    cases = load_dataset(args.categories)
    if not cases:
        print("[error] Aucun cas de test chargé. Vérifiez le dossier dataset/")
        return 2

    print(f"[info] {len(cases)} cas de test chargés\n")

    # Mode dry-run: juste valider et afficher le plan
    if args.dry_run or not args.run:
        print("[dry-run] Validation du dataset:")
        for case in cases:
            case_id = case.get("id", "?")
            category = case.get("category", "?")
            max_tokens = case.get("max_tokens", 200)
            msgs = build_messages(case)
            n_msgs = len(msgs)
            print(f"  ✓ {case_id:20s} [{category:20s}] {n_msgs} message(s), max_tokens={max_tokens}")

        print(f"\n[dry-run] Plan d'exécution:")
        print(f"  {len(cases)} appels vLLM × ~1 s TTFT + génération = estimé {len(cases) * 15 // 60} min")
        print(f"\n  Pour exécuter: ajouter le flag --run\n")
        return 0

    # Mode exécution réelle
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    run_date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    model_slug = args.model.replace("/", "_").replace(":", "_")

    vram_before = get_vram_mb()
    results = []
    errors = 0

    for i, case in enumerate(cases):
        case_id = case.get("id", f"case-{i:03d}")
        category = case.get("category", "unknown")
        max_tokens = case.get("max_tokens", 200)

        print(f"[{i+1:02d}/{len(cases)}] {case_id} ({category}) ... ", end="", flush=True)

        messages = build_messages(case)

        vram_before_case = get_vram_mb()
        result = call_vllm_streaming(
            endpoint=args.endpoint,
            model=args.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=args.temperature,
            timeout=args.timeout,
        )
        vram_after_case = get_vram_mb()

        if result.get("error"):
            print(f"ERROR: {result['error']}")
            errors += 1
            results.append({
                "id": case_id,
                "category": category,
                "error": result["error"],
                "perf": {"ttft_ms": 0, "total_ms": 0, "tokens_per_sec": 0},
                "eval": {"pass": False, "score": 0, "threshold": QUALITY_THRESHOLDS.get(category, 0.75)},
            })
            continue

        # Évaluation automatique — Fix1: scoring sur final_text (post-strip thinking)
        eval_result = evaluate_case(case, result["text"])  # result["text"] = final_text déjà

        # LLM-as-judge (si activé et cas avec judge_criteria)
        judge_result = None
        if args.judge_model and case.get("expected", {}).get("judge_criteria"):
            judge_result = llm_judge(
                case=case,
                model_response=result["text"],
                judge_endpoint=args.judge_endpoint or args.endpoint,
                judge_model=args.judge_model,
            )

        pass_str = "✅" if eval_result["pass"] else "❌"
        ttft_resp = result.get("ttft_response_ms", result["ttft_ms"])
        print(f"{pass_str} score={eval_result['score']:.2f} | TTFT={result['ttft_ms']:.0f}ms ttft_resp={ttft_resp:.0f}ms | {result['tokens_per_sec']:.1f}tok/s")

        # Fix4: inclure raw_text, final_text, ttft_total_ms, ttft_response_ms dans le JSON
        results.append({
            "id": case_id,
            "category": category,
            "perf": {
                "ttft_ms": result["ttft_ms"],
                "ttft_total_ms": result.get("ttft_total_ms", result["ttft_ms"]),
                "ttft_response_ms": result.get("ttft_response_ms", result["ttft_ms"]),
                "total_ms": result["total_ms"],
                "tokens_generated": result["tokens_generated"],
                "tokens_per_sec": result["tokens_per_sec"],
                "vram_before_mb": vram_before_case,
                "vram_after_mb": vram_after_case,
            },
            "eval": eval_result,
            "judge": judge_result,
            "raw_text": result.get("raw_text", ""),
            "final_text": result.get("final_text", result["text"]),
            "response_preview": result["text"][:300],
        })

        # Pause courtoise entre appels
        if args.delay > 0:
            time.sleep(args.delay)

    vram_after = get_vram_mb()

    # Générer rapport
    report_md = generate_report(
        model=args.model,
        endpoint=args.endpoint,
        results=results,
        run_date=run_date,
        vram_before_mb=vram_before,
        vram_after_mb=vram_after,
    )

    # Sauvegarder
    if args.output:
        report_path = Path(args.output)
        report_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        report_path = REPORTS_DIR / f"report_{model_slug}_{run_date[:10]}.md"
    results_path = REPORTS_DIR / f"results_{model_slug}_{run_date[:10]}.json"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_md)

    with open(results_path, "w", encoding="utf-8") as f:
        json.dump({
            "model": args.model,
            "endpoint": args.endpoint,
            "run_date": run_date,
            "total_cases": len(results),
            "errors": errors,
            "results": results,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n[info] Rapport sauvegardé: {report_path}")
    print(f"[info] Résultats JSON:     {results_path}")

    # Afficher résumé
    print("\n" + report_md[:2000])

    # Retourner exit code selon PASS/FAIL
    passed = sum(1 for r in results if r.get("eval", {}).get("pass", False))
    global_accuracy = passed / len(results) if results else 0.0

    by_cat_pass = {}
    for r in results:
        cat = r.get("category", "unknown")
        if cat not in by_cat_pass:
            by_cat_pass[cat] = {"passed": 0, "total": 0}
        by_cat_pass[cat]["total"] += 1
        if r.get("eval", {}).get("pass", False):
            by_cat_pass[cat]["passed"] += 1

    all_pass = all(
        (v["passed"] / v["total"]) >= QUALITY_THRESHOLDS.get(cat, 0.75)
        for cat, v in by_cat_pass.items()
        if v["total"] > 0
    )

    return 0 if all_pass else 1


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Lexa Phase 2 — Harness benchmark modèles NVFP4",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
  # Dry-run (validation dataset, pas d'appels LLM)
  python run_benchmark.py --model Qwen/Qwen2.5-7B-Instruct

  # Exécution réelle
  python run_benchmark.py --model apolo13x/Qwen3.5-35B-A3B-NVFP4 --run

  # Une seule catégorie
  python run_benchmark.py --model MODEL --categories classifier-kafer --run

  # Avec LLM-as-judge
  python run_benchmark.py --model MODEL --judge-model apolo13x/Qwen3.5-35B-A3B-NVFP4 --run

  # Endpoint personnalisé (DGX)
  python run_benchmark.py --model nvidia/Llama-3.1-8B --endpoint http://192.168.110.103:8000 --run
        """
    )

    # Modèle et endpoint
    parser.add_argument("--model", required=True, help="Nom du modèle vLLM à benchmarker")
    parser.add_argument("--endpoint", default="http://localhost:8000",
                        help="URL base de l'endpoint vLLM (défaut: http://localhost:8000)")

    # Sélection du dataset
    parser.add_argument("--categories", nargs="+",
                        choices=list(DATASET_FILES.keys()),
                        default=list(DATASET_FILES.keys()),
                        help="Catégories à inclure (défaut: toutes)")

    # LLM-as-judge
    parser.add_argument("--judge-model", default=None,
                        help="Modèle à utiliser pour le LLM-as-judge (optionnel)")
    parser.add_argument("--judge-endpoint", default=None,
                        help="Endpoint du judge (défaut: même que --endpoint)")

    # Options d'exécution
    parser.add_argument("--run", action="store_true",
                        help="Exécuter réellement les benchmarks (sinon dry-run)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Valider le dataset sans appels LLM (défaut si --run absent)")
    parser.add_argument("--temperature", type=float, default=0.1,
                        help="Température de génération (défaut: 0.1)")
    parser.add_argument("--timeout", type=int, default=120,
                        help="Timeout par requête en secondes (défaut: 120)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Délai en secondes entre les requêtes (défaut: 0.5)")
    parser.add_argument("--output", default=None,
                        help="Chemin de sortie pour le rapport markdown (optionnel, override le nom auto)")

    args = parser.parse_args()

    # Si ni --run ni --dry-run explicite, on fait dry-run
    if not args.run:
        args.dry_run = True

    sys.exit(run_benchmark(args))


if __name__ == "__main__":
    main()
