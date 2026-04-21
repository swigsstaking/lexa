#!/usr/bin/env python3
"""
run_quality.py — Harness tests qualité approfondis Lexa vLLM migration
Tests 12 agents × 10 cas = 120 questions + 20 edge cases dédiés

Usage:
    python run_quality.py [--agents tva lexa ...] [--edge-only] [--dry-run]
    python run_quality.py --agents all
    python run_quality.py --edge-only
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import statistics
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    print("[ERREUR] 'requests' non installé. pip install requests", file=sys.stderr)
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL = os.environ.get("LEXA_API_URL", "https://lexa.swigs.online")
JWT_TOKEN = os.environ.get(
    "LEXA_JWT",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlNTQzYzQxOS03ZjQxLTQ0YmQtOGE1Zi1iNTkxYWY2OTQxMjAiLCJ0ZW5hbnRJZCI6ImUyNDVjYjJlLTQ4NjAtNGIxYS04NjMxLWE0NWFkMjgwMjgzMSIsImFjdGl2ZVRlbmFudElkIjoiZTI0NWNiMmUtNDg2MC00YjFhLTg2MzEtYTQ1YWQyODAyODMxIiwibWVtYmVyc2hpcHMiOlsiZTI0NWNiMmUtNDg2MC00YjFhLTg2MzEtYTQ1YWQyODAyODMxIiwiNzJjYWE3OWMtNDBjYi00NDBjLTk3OTctOGQzMGUyOGZjZjI4IiwiNDdlZGRiMDUtZDQ2Yi00OGNkLWFkMjMtNjk4Y2MzMGQxZDg5IiwiMjc2YWE5OWUtZWZlNi00ODkwLWI5YjgtY2VkYTcxZGExOTFlIl0sImVtYWlsIjoicWEtdGVzdEBsZXhhLnRlc3QiLCJpYXQiOjE3NzY3NjAzODMsImV4cCI6MTc3NzM2NTE4M30.zFzp8JT13L5ppKnRimVo2b6zh-83ADOePfHSI2HKqM0"
)
TIMEOUT_S = 90
QUALITY_DIR = Path(__file__).parent


def extract_tenant_from_jwt(token: str) -> Optional[str]:
    """Décode le payload JWT (base64url) et extrait activeTenantId sans lib externe."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
        return payload.get("activeTenantId") or payload.get("tenantId")
    except Exception:
        return None


# Plusieurs agents (ex: lexa) exigent un body.tenantId (schema Zod strict),
# et toutes les routes requireAuth attendent un header X-Tenant-Id pour les
# queries RLS. On extrait le tenant depuis le JWT — évite le bug "tenantId Required".
TENANT_ID = os.environ.get("LEXA_TENANT_ID") or extract_tenant_from_jwt(JWT_TOKEN) or ""

# ── Mapping agent → endpoint ──────────────────────────────────────────────────
AGENT_ENDPOINTS = {
    "lexa":          "/api/agents/lexa/ask",
    "tva":           "/api/agents/tva/ask",
    "cloture":       "/api/agents/cloture/ask",
    "conseiller":    "/api/agents/conseiller/ask",
    "fiscal-pm":     "/api/agents/fiscal-pm/ask",
    "fiscal-pp":     "/api/agents/fiscal-pp/ask",
    "fiscal-pp-vs":  "/api/agents/fiscal-pp-vs/ask",
    "fiscal-pp-ge":  "/api/agents/fiscal-pp-ge/ask",
    "fiscal-pp-vd":  "/api/agents/fiscal-pp-vd/ask",
    "fiscal-pp-fr":  "/api/agents/fiscal-pp-fr/ask",
    "fiscal-pp-ne":  "/api/agents/fiscal-pp-ne/ask",
    "fiscal-pp-ju":  "/api/agents/fiscal-pp-ju/ask",
    "fiscal-pp-bj":  "/api/agents/fiscal-pp-bj/ask",
}

# Fallback: si l'endpoint spécifique échoue, tenter le générique fiscal-pp
FALLBACK_ENDPOINTS = {
    "fiscal-pp-vs":  "/api/agents/fiscal-pp/ask",
    "fiscal-pp-ge":  "/api/agents/fiscal-pp/ask",
    "fiscal-pp-vd":  "/api/agents/fiscal-pp/ask",
    "fiscal-pp-fr":  "/api/agents/fiscal-pp/ask",
    "fiscal-pp-ne":  "/api/agents/fiscal-pp/ask",
    "fiscal-pp-ju":  "/api/agents/fiscal-pp/ask",
    "fiscal-pp-bj":  "/api/agents/fiscal-pp/ask",
}

AGENT_DATASET_MAP = {
    "lexa":          "lexa.json",
    "tva":           "tva.json",
    "cloture":       "cloture.json",
    "conseiller":    "conseiller.json",
    "fiscal-pm":     "fiscal-pm.json",
    "fiscal-pp-vs":  "fiscal-pp-vs.json",
    "fiscal-pp-ge":  "fiscal-pp-ge.json",
    "fiscal-pp-vd":  "fiscal-pp-vd.json",
    "fiscal-pp-fr":  "fiscal-pp-fr.json",
    "fiscal-pp-ne":  "fiscal-pp-ne.json",
    "fiscal-pp-ju":  "fiscal-pp-ju.json",
    "fiscal-pp-bj":  "fiscal-pp-bj.json",
}

ALL_AGENTS = list(AGENT_DATASET_MAP.keys())


# ── Helpers ───────────────────────────────────────────────────────────────────

def strip_thinking(text: str) -> str:
    """Supprime les blocs <think>...</think> (Qwen3 MoE)."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()


def score_response(response_text: str, test_case: dict) -> dict:
    """
    Score une réponse selon les critères du test case.
    Retourne un dict avec: contains_score, regex_match, must_not_fail, passed, details
    """
    text = strip_thinking(response_text).lower()
    original = strip_thinking(response_text)

    # Score contains: fraction de mots-clés présents
    expected_contains = test_case.get("expected_contains", [])
    contains_hits = 0
    contains_details = []
    for kw in expected_contains:
        found = kw.lower() in text
        contains_hits += 1 if found else 0
        contains_details.append({"keyword": kw, "found": found})

    contains_score = (contains_hits / len(expected_contains)) if expected_contains else 1.0

    # Regex match
    regex_pattern = test_case.get("expected_regex", "")
    regex_match = False
    if regex_pattern:
        try:
            regex_match = bool(re.search(regex_pattern, original, re.IGNORECASE))
        except re.error:
            regex_match = False

    # Must not contain
    must_not = test_case.get("must_not_contain", [])
    must_not_violations = [kw for kw in must_not if kw.lower() in text]
    must_not_pass = len(must_not_violations) == 0

    # Règle de passage:
    # - Si expected_contains non vide: score >= 0.5 OU regex match
    # - Si expected_contains vide: regex match (edge cases)
    # - must_not_contain doit toujours passer
    if expected_contains:
        quality_pass = (contains_score >= 0.5 or regex_match)
    else:
        # Edge case: on se base uniquement sur regex
        quality_pass = regex_match

    passed = quality_pass and must_not_pass

    return {
        "contains_score": round(contains_score, 3),
        "regex_match": regex_match,
        "must_not_pass": must_not_pass,
        "must_not_violations": must_not_violations,
        "passed": passed,
        "contains_details": contains_details,
    }


def call_agent(agent: str, question: str, dry_run: bool = False) -> dict:
    """
    Appelle l'API agent et retourne dict avec response, ttft_ms, total_ms, status_code, error.
    """
    if dry_run:
        return {
            "response": "[DRY-RUN] Réponse simulée pour: " + question[:50],
            "ttft_ms": 0,
            "total_ms": 0,
            "status_code": 200,
            "error": None,
        }

    endpoint = AGENT_ENDPOINTS.get(agent)
    if not endpoint:
        return {
            "response": "",
            "ttft_ms": 0,
            "total_ms": 0,
            "status_code": 0,
            "error": f"Agent inconnu: {agent}",
        }

    url = BASE_URL.rstrip("/") + endpoint
    headers = {
        "Authorization": f"Bearer {JWT_TOKEN}",
        "Content-Type": "application/json",
    }
    if TENANT_ID:
        headers["X-Tenant-Id"] = TENANT_ID
    # lexa/ask valide `tenantId` côté body via Zod (schema strict).
    # Les autres routes l'ignorent (Zod .optional ou champs additionnels tolérés).
    payload = {"question": question}
    if TENANT_ID:
        payload["tenantId"] = TENANT_ID

    t_start = time.perf_counter()
    ttft_ms = None
    response_text = ""
    status_code = 0
    error = None

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT_S)
        t_first = time.perf_counter()
        ttft_ms = (t_first - t_start) * 1000
        status_code = resp.status_code

        if resp.status_code == 200:
            data = resp.json()
            # Plusieurs formats possibles: {answer:...}, {response:...}, {message:...}, string directe
            if isinstance(data, dict):
                response_text = (
                    data.get("answer")
                    or data.get("response")
                    or data.get("message")
                    or data.get("content")
                    or str(data)
                )
            elif isinstance(data, str):
                response_text = data
            else:
                response_text = str(data)
        elif resp.status_code == 404:
            # Tenter le fallback
            fallback = FALLBACK_ENDPOINTS.get(agent)
            if fallback:
                url2 = BASE_URL.rstrip("/") + fallback
                resp2 = requests.post(url2, json=payload, headers=headers, timeout=TIMEOUT_S)
                status_code = resp2.status_code
                if resp2.status_code == 200:
                    data2 = resp2.json()
                    response_text = (
                        data2.get("answer")
                        or data2.get("response")
                        or data2.get("message")
                        or str(data2)
                    )
                else:
                    error = f"HTTP {resp2.status_code} (fallback)"
                    response_text = resp2.text[:500]
            else:
                error = f"HTTP 404: endpoint non trouvé"
                response_text = resp.text[:200]
        else:
            error = f"HTTP {resp.status_code}"
            response_text = resp.text[:500]

    except requests.exceptions.Timeout:
        error = f"Timeout après {TIMEOUT_S}s"
        status_code = 0
    except requests.exceptions.ConnectionError as e:
        error = f"Connexion échouée: {str(e)[:100]}"
        status_code = 0
    except Exception as e:
        error = f"Erreur inattendue: {str(e)[:100]}"
        status_code = 0

    t_end = time.perf_counter()
    total_ms = (t_end - t_start) * 1000
    if ttft_ms is None:
        ttft_ms = total_ms

    return {
        "response": response_text,
        "ttft_ms": round(ttft_ms, 1),
        "total_ms": round(total_ms, 1),
        "status_code": status_code,
        "error": error,
    }


def pairwise_similarity(texts: list) -> float:
    """Moyenne de la similarité SequenceMatcher entre toutes les paires de textes.

    Retourne 1.0 si ≤1 texte, sinon ratio moyen ∈ [0, 1].
    Plus élevé = réponses plus reproductibles."""
    stripped = [strip_thinking(t) for t in texts if t]
    if len(stripped) < 2:
        return 1.0
    sims = []
    for i in range(len(stripped)):
        for j in range(i + 1, len(stripped)):
            sims.append(SequenceMatcher(None, stripped[i], stripped[j]).ratio())
    return statistics.mean(sims) if sims else 1.0


def run_single_case(agent: str, tc: dict, repeat: int, dry_run: bool) -> dict:
    """Exécute un test case `repeat` fois et agrège score + variance + similarité."""
    runs = []
    for _ in range(max(1, repeat)):
        api_result = call_agent(agent, tc.get("question", ""), dry_run=dry_run)
        scores = score_response(api_result["response"], tc)
        runs.append({
            "response": api_result["response"],
            "ttft_ms": api_result["ttft_ms"],
            "total_ms": api_result["total_ms"],
            "status_code": api_result["status_code"],
            "error": api_result["error"],
            "scores": scores,
            "passed": scores["passed"],
        })

    contains_scores = [r["scores"]["contains_score"] for r in runs]
    latencies = [r["total_ms"] for r in runs if r["total_ms"] > 0]
    pass_count = sum(1 for r in runs if r["passed"])
    similarity = pairwise_similarity([r["response"] for r in runs])
    score_stdev = statistics.pstdev(contains_scores) if len(contains_scores) > 1 else 0.0

    # Critère "stable" :
    #   - ≥ 70 % des runs passent
    #   - réponses similaires entre elles (similarity ≥ 0.55 — seuil indulgent,
    #     Qwen varie la prose mais garde le fond) OU score stable (stdev < 0.15)
    pass_rate = pass_count / len(runs)
    consistent = (similarity >= 0.55) or (score_stdev < 0.15)
    stable = pass_rate >= 0.7 and consistent

    return {
        "runs": runs,
        "repeat": len(runs),
        "pass_count": pass_count,
        "pass_rate": round(pass_rate, 3),
        "avg_contains_score": round(statistics.mean(contains_scores), 3),
        "score_stdev": round(score_stdev, 3),
        "similarity": round(similarity, 3),
        "latency_avg_ms": round(statistics.mean(latencies), 1) if latencies else 0,
        "latency_stdev_ms": round(statistics.pstdev(latencies), 1) if len(latencies) > 1 else 0,
        "stable": stable,
    }


def run_agent_tests(agent: str, dataset: list, dry_run: bool, verbose: bool, repeat: int = 1) -> list:
    """Exécute les tests pour un agent. Retourne la liste des résultats."""
    results = []
    print(f"\n{'='*60}")
    print(f"AGENT: {agent.upper()} ({len(dataset)} cas × {repeat} run{'s' if repeat > 1 else ''})")
    print(f"{'='*60}")

    for i, tc in enumerate(dataset):
        tc_id = tc.get("id", f"{agent}-{i+1:03d}")
        category = tc.get("category", "?")
        question = tc.get("question", "")

        print(f"  [{i+1:02d}/{len(dataset)}] {tc_id} ({category})", end="", flush=True)

        agg = run_single_case(agent, tc, repeat, dry_run)
        # Le pass final = majorité des runs passent (≥ 50 %)
        passed = agg["pass_rate"] >= 0.5
        first_run = agg["runs"][0]

        status = "✓ PASS" if passed else "✗ FAIL"
        repro = "🔁 stable" if agg["stable"] else "⚠ instable"
        print(f" {status} {repro} | {agg['latency_avg_ms']:.0f}ms | "
              f"pass={agg['pass_count']}/{repeat} sim={agg['similarity']:.2f}")

        if verbose and (not passed or not agg["stable"]):
            print(f"      Q: {question[:80]}...")
            print(f"      R(1): {first_run['response'][:120]}...")
            if repeat > 1 and len(agg["runs"]) > 1:
                print(f"      R(2): {agg['runs'][1]['response'][:120]}...")
            if first_run["scores"]["must_not_violations"]:
                print(f"      VIOLATION must_not: {first_run['scores']['must_not_violations']}")

        results.append({
            "id": tc_id,
            "agent": agent,
            "category": category,
            "question": question,
            "response": first_run["response"][:500],
            "all_responses": [r["response"][:500] for r in agg["runs"]],
            "ttft_ms": first_run["ttft_ms"],
            "total_ms": agg["latency_avg_ms"],
            "status_code": first_run["status_code"],
            "error": first_run["error"],
            "scores": first_run["scores"],
            "passed": passed,
            "repeat_agg": {
                "repeat": agg["repeat"],
                "pass_rate": agg["pass_rate"],
                "pass_count": agg["pass_count"],
                "avg_contains_score": agg["avg_contains_score"],
                "score_stdev": agg["score_stdev"],
                "similarity": agg["similarity"],
                "latency_stdev_ms": agg["latency_stdev_ms"],
                "stable": agg["stable"],
            },
        })

    return results


def run_edge_cases(dataset: list, dry_run: bool, verbose: bool, repeat: int = 1) -> list:
    """Exécute les edge cases dédiés."""
    results = []
    print(f"\n{'='*60}")
    print(f"EDGE CASES DÉDIÉS ({len(dataset)} cas × {repeat} run{'s' if repeat > 1 else ''})")
    print(f"{'='*60}")

    for i, tc in enumerate(dataset):
        tc_id = tc.get("id", f"edge-{i+1:03d}")
        agent = tc.get("agent", "lexa")
        category = tc.get("category", "?")
        question = tc.get("question", "")
        description = tc.get("description", "")

        print(f"  [{i+1:02d}/{len(dataset)}] {tc_id} [{agent}] ({category})", end="", flush=True)

        agg = run_single_case(agent, tc, repeat, dry_run)
        passed = agg["pass_rate"] >= 0.5
        first_run = agg["runs"][0]

        status = "✓ PASS" if passed else "✗ FAIL"
        repro = "🔁 stable" if agg["stable"] else "⚠ instable"
        print(f" {status} {repro} | {agg['latency_avg_ms']:.0f}ms | pass={agg['pass_count']}/{repeat} sim={agg['similarity']:.2f}")

        if verbose and (not passed or not agg["stable"]):
            print(f"      DESC: {description}")
            print(f"      Q: {question[:80]}...")
            print(f"      R(1): {first_run['response'][:120]}...")

        results.append({
            "id": tc_id,
            "agent": agent,
            "category": category,
            "description": description,
            "question": question,
            "response": first_run["response"][:500],
            "all_responses": [r["response"][:500] for r in agg["runs"]],
            "ttft_ms": first_run["ttft_ms"],
            "total_ms": agg["latency_avg_ms"],
            "status_code": first_run["status_code"],
            "error": first_run["error"],
            "scores": first_run["scores"],
            "passed": passed,
            "repeat_agg": {
                "repeat": agg["repeat"],
                "pass_rate": agg["pass_rate"],
                "pass_count": agg["pass_count"],
                "avg_contains_score": agg["avg_contains_score"],
                "score_stdev": agg["score_stdev"],
                "similarity": agg["similarity"],
                "latency_stdev_ms": agg["latency_stdev_ms"],
                "stable": agg["stable"],
            },
        })

    return results


def compute_agent_stats(results: list) -> dict:
    """Calcule les stats par agent."""
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    accuracy = passed / total if total > 0 else 0.0

    latencies = [r["total_ms"] for r in results if r["total_ms"] > 0]
    ttfts = [r["ttft_ms"] for r in results if r["ttft_ms"] > 0]

    failures = [r for r in results if not r["passed"]]
    # Top 5 failures
    top_failures = sorted(failures, key=lambda r: r["scores"]["contains_score"])[:5]

    # Stats répétition (si dispo)
    with_repeat = [r for r in results if r.get("repeat_agg")]
    repeat_stats = None
    if with_repeat:
        sims = [r["repeat_agg"]["similarity"] for r in with_repeat]
        stdevs = [r["repeat_agg"]["score_stdev"] for r in with_repeat]
        stable_count = sum(1 for r in with_repeat if r["repeat_agg"]["stable"])
        repeat_stats = {
            "repeat": with_repeat[0]["repeat_agg"]["repeat"],
            "similarity_avg": round(statistics.mean(sims), 3),
            "similarity_min": round(min(sims), 3),
            "score_stdev_avg": round(statistics.mean(stdevs), 3),
            "stable_count": stable_count,
            "stable_pct": round(stable_count / len(with_repeat) * 100, 1),
            "unstable_ids": [r["id"] for r in with_repeat if not r["repeat_agg"]["stable"]][:10],
        }

    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "accuracy": round(accuracy, 4),
        "accuracy_pct": round(accuracy * 100, 1),
        "latency_avg_ms": round(statistics.mean(latencies), 1) if latencies else 0,
        "latency_median_ms": round(statistics.median(latencies), 1) if latencies else 0,
        "ttft_avg_ms": round(statistics.mean(ttfts), 1) if ttfts else 0,
        "top_failures": top_failures,
        "flag_low_quality": accuracy < 0.80,
        "repeat": repeat_stats,
    }


def generate_report(all_results: dict, edge_results: list, output_path: Path) -> str:
    """Génère le rapport markdown."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Stats globales agents principaux
    all_agent_results = []
    for agent_res in all_results.values():
        all_agent_results.extend(agent_res["results"])
    global_passed = sum(1 for r in all_agent_results if r["passed"])
    global_total = len(all_agent_results)
    global_accuracy = global_passed / global_total if global_total > 0 else 0

    # Stats edge cases
    edge_passed = sum(1 for r in edge_results if r["passed"])
    edge_total = len(edge_results)
    edge_accuracy = edge_passed / edge_total if edge_total > 0 else 0

    # Détection du mode répétition (premier résultat qui a un repeat_agg)
    repeat_n = 1
    for data in all_results.values():
        sample = next((r for r in data["results"] if r.get("repeat_agg")), None)
        if sample:
            repeat_n = sample["repeat_agg"]["repeat"]
            break
    if repeat_n == 1:
        for r in edge_results:
            if r.get("repeat_agg"):
                repeat_n = r["repeat_agg"]["repeat"]
                break

    lines = [
        f"# Rapport Qualité — Tests vLLM Migration Lexa",
        f"",
        f"**Date** : {now}  ",
        f"**Endpoint** : {BASE_URL}  ",
        f"**Runs par question** : {repeat_n}  ",
        f"**Total tests** : {global_total} agents + {edge_total} edge cases = {global_total + edge_total} cas  ",
        f"**Accuracy globale agents** : {global_passed}/{global_total} = **{global_accuracy*100:.1f}%**  ",
        f"**Accuracy edge cases** : {edge_passed}/{edge_total} = **{edge_accuracy*100:.1f}%**  ",
        f"",
        f"---",
        f"",
        f"## Tableau par agent",
        f"",
    ]

    if repeat_n > 1:
        lines.append("| Agent | Pass | Fail | Accuracy | Latence moy. (ms) | Cohérence (sim.) | Stables | Flag |")
        lines.append("|-------|------|------|----------|-------------------|------------------|---------|------|")
    else:
        lines.append("| Agent | Pass | Fail | Accuracy | Latence moy. (ms) | TTFT moy. (ms) | Flag |")
        lines.append("|-------|------|------|----------|-------------------|----------------|------|")

    for agent, data in all_results.items():
        stats = data["stats"]
        flag = "🚨 LOW" if stats["flag_low_quality"] else "OK"
        if repeat_n > 1 and stats.get("repeat"):
            rep = stats["repeat"]
            lines.append(
                f"| {agent} | {stats['passed']} | {stats['failed']} | "
                f"{stats['accuracy_pct']}% | {stats['latency_avg_ms']} | "
                f"{rep['similarity_avg']:.2f} | "
                f"{rep['stable_count']}/{stats['total']} ({rep['stable_pct']}%) | {flag} |"
            )
        else:
            lines.append(
                f"| {agent} | {stats['passed']} | {stats['failed']} | "
                f"{stats['accuracy_pct']}% | {stats['latency_avg_ms']} | "
                f"{stats['ttft_avg_ms']} | {flag} |"
            )

    # Edge cases dans le tableau
    if edge_results:
        edge_stats = compute_agent_stats(edge_results)
        flag = "🚨 LOW" if edge_stats["flag_low_quality"] else "OK"
        if repeat_n > 1 and edge_stats.get("repeat"):
            rep = edge_stats["repeat"]
            lines.append(
                f"| **edge-cases** | {edge_stats['passed']} | {edge_stats['failed']} | "
                f"{edge_stats['accuracy_pct']}% | {edge_stats['latency_avg_ms']} | "
                f"{rep['similarity_avg']:.2f} | "
                f"{rep['stable_count']}/{edge_stats['total']} ({rep['stable_pct']}%) | {flag} |"
            )
        else:
            lines.append(
                f"| **edge-cases** | {edge_stats['passed']} | {edge_stats['failed']} | "
                f"{edge_stats['accuracy_pct']}% | {edge_stats['latency_avg_ms']} | "
                f"{edge_stats['ttft_avg_ms']} | {flag} |"
            )

    # Section cohérence dédiée si mode répétition
    if repeat_n > 1:
        lines.extend([
            f"",
            f"---",
            f"",
            f"## Cohérence des réponses ({repeat_n} runs)",
            f"",
            f"Un test est **stable** si ≥70% des runs passent ET (similarité moyenne ≥ 0.55 OU écart-type du score < 0.15).",
            f"",
        ])
        for agent, data in all_results.items():
            rep = data["stats"].get("repeat")
            if not rep:
                continue
            lines.append(f"- **{agent}** : cohérence {rep['similarity_avg']:.2f} (min {rep['similarity_min']:.2f}), "
                         f"{rep['stable_count']}/{data['stats']['total']} cas stables ({rep['stable_pct']}%)")
            if rep["unstable_ids"]:
                lines.append(f"  - instables : `{', '.join(rep['unstable_ids'])}`")
        lines.append("")

    lines.extend([
        f"",
        f"---",
        f"",
        f"## Top Failures par agent",
        f"",
    ])

    # Top failures
    all_failures = []
    for agent, data in all_results.items():
        stats = data["stats"]
        if stats["top_failures"]:
            lines.append(f"### {agent}")
            lines.append(f"")
            for f_case in stats["top_failures"][:3]:
                sc = f_case["scores"]
                lines.append(f"**{f_case['id']}** ({f_case['category']})")
                lines.append(f"- Q: `{f_case['question'][:100]}...`")
                lines.append(f"- R: `{f_case['response'][:150]}...`")
                lines.append(f"- Score contains: {sc['contains_score']:.0%} | regex: {'Y' if sc['regex_match'] else 'N'} | must_not: {'OK' if sc['must_not_pass'] else '⚠️ VIOLATION'}")
                lines.append(f"")
                all_failures.append(f_case)

    # Top 10 failures critiques globaux
    all_failures_sorted = sorted(all_failures, key=lambda r: r["scores"]["contains_score"])[:10]
    if all_failures_sorted:
        lines.extend([
            f"---",
            f"",
            f"## Top 10 Failures Critiques",
            f"",
            f"| # | Agent | ID | Q (extrait) | Contains | Regex | Must-not |",
            f"|---|-------|----|-------------|----------|-------|----------|",
        ])
        for i, f_case in enumerate(all_failures_sorted, 1):
            sc = f_case["scores"]
            lines.append(
                f"| {i} | {f_case['agent']} | {f_case['id']} | "
                f"`{f_case['question'][:60]}...` | "
                f"{sc['contains_score']:.0%} | {'Y' if sc['regex_match'] else 'N'} | "
                f"{'OK' if sc['must_not_pass'] else '⚠️'} |"
            )

    # Edge cases détail
    edge_failures = [r for r in edge_results if not r["passed"]]
    if edge_failures:
        lines.extend([
            f"",
            f"---",
            f"",
            f"## Edge Cases — Failures",
            f"",
        ])
        for f_case in edge_failures:
            sc = f_case["scores"]
            lines.append(f"**{f_case['id']}** — {f_case.get('description', '')} [{f_case['agent']}]")
            lines.append(f"- Q: `{f_case['question'][:100]}`")
            lines.append(f"- R: `{f_case['response'][:150]}...`")
            lines.append(f"- Contains: {sc['contains_score']:.0%} | Regex: {'Y' if sc['regex_match'] else 'N'}")
            lines.append(f"")

    # Verdict final
    flagged_agents = [a for a, d in all_results.items() if d["stats"]["flag_low_quality"]]
    lines.extend([
        f"---",
        f"",
        f"## Verdict final",
        f"",
    ])

    if global_accuracy >= 0.80 and edge_accuracy >= 0.70:
        verdict = "**QUALITÉ OK POUR PROD** — vLLM validé sur les 12 agents."
    elif global_accuracy >= 0.65:
        verdict = "**QUALITÉ PARTIELLE** — vLLM acceptable mais amélioration recommandée."
    else:
        verdict = "**RETOUR OLLAMA RECOMMANDÉ** — qualité insuffisante sur trop d'agents."

    lines.append(f"**{verdict}**")
    lines.append(f"")
    lines.append(f"- Accuracy globale agents : {global_accuracy*100:.1f}%")
    lines.append(f"- Accuracy edge cases : {edge_accuracy*100:.1f}%")

    if flagged_agents:
        lines.append(f"- Agents avec qualité < 80% : {', '.join(flagged_agents)}")
        lines.append(f"  → Ces agents nécessitent une attention particulière.")
    else:
        lines.append(f"- Aucun agent en dessous du seuil de 80%.")

    lines.append(f"")
    lines.append(f"---")
    lines.append(f"*Généré par run_quality.py — tests vLLM migration Lexa*")

    content = "\n".join(lines)
    output_path.write_text(content, encoding="utf-8")
    return content


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Harness tests qualité Lexa vLLM")
    parser.add_argument(
        "--agents",
        nargs="+",
        default=["all"],
        help=f"Agents à tester. 'all' pour tous. Disponibles: {', '.join(ALL_AGENTS)}",
    )
    parser.add_argument(
        "--edge-only",
        action="store_true",
        help="Exécuter uniquement les edge cases dédiés",
    )
    parser.add_argument(
        "--no-edge",
        action="store_true",
        help="Ignorer les edge cases dédiés",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simuler les appels API sans vraiment appeler (pour debug)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Afficher les détails des failures",
    )
    parser.add_argument(
        "--repeat",
        type=int,
        default=1,
        help="Nombre de runs par question (cohérence/reproductibilité). Défaut 1 ; 3-5 recommandé pour stabilité.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=QUALITY_DIR / "REPORT.md",
        help="Chemin du rapport de sortie",
    )
    parser.add_argument(
        "--results-json",
        type=Path,
        default=QUALITY_DIR / "results.json",
        help="Chemin du JSON de résultats complet",
    )
    args = parser.parse_args()

    if not HAS_REQUESTS and not args.dry_run:
        print("[ERREUR] requests requis. pip install requests")
        sys.exit(1)

    # Sélection des agents
    if args.edge_only:
        selected_agents = []
    elif "all" in args.agents:
        selected_agents = ALL_AGENTS
    else:
        selected_agents = [a for a in args.agents if a in AGENT_DATASET_MAP]
        unknown = [a for a in args.agents if a not in AGENT_DATASET_MAP and a != "all"]
        if unknown:
            print(f"[WARN] Agents inconnus ignorés: {unknown}")

    print(f"\n{'='*60}")
    print(f"LEXA QUALITY HARNESS — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Endpoint: {BASE_URL}")
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"Agents: {selected_agents or '(edge cases only)'}")
    print(f"{'='*60}")

    all_results = {}
    start_global = time.perf_counter()

    # Tests agents principaux
    for agent in selected_agents:
        dataset_file = QUALITY_DIR / AGENT_DATASET_MAP[agent]
        if not dataset_file.exists():
            print(f"[WARN] Dataset introuvable: {dataset_file}")
            continue

        with open(dataset_file, encoding="utf-8") as f:
            dataset = json.load(f)

        results = run_agent_tests(agent, dataset, dry_run=args.dry_run, verbose=args.verbose, repeat=args.repeat)
        stats = compute_agent_stats(results)
        all_results[agent] = {"results": results, "stats": stats}

        # Summary immédiat
        flag = " 🚨 LOW QUALITY" if stats["flag_low_quality"] else ""
        print(f"  → {agent}: {stats['accuracy_pct']}% ({stats['passed']}/{stats['total']}) "
              f"| lat={stats['latency_avg_ms']}ms{flag}")

    # Edge cases dédiés
    edge_results = []
    if not args.no_edge:
        edge_file = QUALITY_DIR / "edge-cases.json"
        if edge_file.exists():
            with open(edge_file, encoding="utf-8") as f:
                edge_dataset = json.load(f)
            edge_results = run_edge_cases(edge_dataset, dry_run=args.dry_run, verbose=args.verbose, repeat=args.repeat)
            edge_stats = compute_agent_stats(edge_results)
            flag = " 🚨 LOW" if edge_stats["flag_low_quality"] else ""
            print(f"\n  → edge-cases: {edge_stats['accuracy_pct']}% ({edge_stats['passed']}/{edge_stats['total']}){flag}")

    total_elapsed = (time.perf_counter() - start_global)

    # Génération rapport
    if all_results or edge_results:
        print(f"\n{'='*60}")
        print(f"Génération rapport: {args.output}")
        report_content = generate_report(all_results, edge_results, args.output)

        # Sauvegarde JSON complet
        full_results = {
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "endpoint": BASE_URL,
                "dry_run": args.dry_run,
                "elapsed_s": round(total_elapsed, 1),
            },
            "agents": all_results,
            "edge_cases": edge_results,
        }
        args.results_json.write_text(
            json.dumps(full_results, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        print(f"Résultats JSON: {args.results_json}")

        # Résumé terminal
        print(f"\n{'='*60}")
        print(f"RÉSUMÉ FINAL")
        print(f"{'='*60}")

        all_agent_results = []
        for data in all_results.values():
            all_agent_results.extend(data["results"])
        global_passed = sum(1 for r in all_agent_results if r["passed"])
        global_total = len(all_agent_results)

        print(f"Agents: {global_passed}/{global_total} = {global_passed/global_total*100:.1f}%" if global_total else "Aucun test agent")
        if edge_results:
            ep = sum(1 for r in edge_results if r["passed"])
            et = len(edge_results)
            print(f"Edge cases: {ep}/{et} = {ep/et*100:.1f}%")
        print(f"Durée totale: {total_elapsed:.1f}s")
        print(f"Rapport: {args.output}")
    else:
        print("[WARN] Aucun résultat à rapporter.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
