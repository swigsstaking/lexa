#!/usr/bin/env python3
"""
Generate SUMMARY.md from Phase 2 benchmark reports.
Usage: python generate_summary.py <reports_dir>
"""

import os
import sys
import json
import re
from pathlib import Path
from datetime import datetime

REPORTS_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "reports"

# Model metadata (for the comparison table)
MODEL_META = {
    "nvidia_Llama-3.1-8B-Instruct-NVFP4": {
        "name": "nvidia/Llama-3.1-8B-Instruct-NVFP4",
        "arch": "LlamaForCausalLM",
        "params": "8B",
        "type": "dense",
    },
    "RedHatAI_Qwen3-8B-NVFP4": {
        "name": "RedHatAI/Qwen3-8B-NVFP4",
        "arch": "Qwen3ForCausalLM",
        "params": "8B",
        "type": "dense",
    },
    "AxionML_Qwen3.5-9B-NVFP4": {
        "name": "AxionML/Qwen3.5-9B-NVFP4",
        "arch": "Qwen3_5ForConditionalGeneration",
        "params": "9B",
        "type": "dense (incompatible)",
    },
    "apolo13x_Qwen3.5-27B-NVFP4": {
        "name": "apolo13x/Qwen3.5-27B-NVFP4",
        "arch": "Qwen3_5ForConditionalGeneration",
        "params": "27B",
        "type": "dense (incompatible)",
    },
    "RedHatAI_gemma-4-26B-A4B-it-NVFP4": {
        "name": "RedHatAI/gemma-4-26B-A4B-it-NVFP4",
        "arch": "Gemma4ForConditionalGeneration",
        "params": "26B",
        "type": "MoE",
    },
    "RedHatAI_Qwen3-32B-NVFP4": {
        "name": "RedHatAI/Qwen3-32B-NVFP4",
        "arch": "Qwen3ForCausalLM",
        "params": "32B",
        "type": "dense",
    },
    "apolo13x_Qwen3.5-35B-A3B-NVFP4": {
        "name": "apolo13x/Qwen3.5-35B-A3B-NVFP4",
        "arch": "Qwen3_5MoeForCausalLM",
        "params": "35B (A3B)",
        "type": "MoE (BASELINE)",
    },
    "RedHatAI_Qwen3.5-122B-A10B-NVFP4": {
        "name": "RedHatAI/Qwen3.5-122B-A10B-NVFP4",
        "arch": "Qwen3_5MoeForCausalLM",
        "params": "122B (A10B)",
        "type": "MoE",
    },
}

THRESHOLDS = {
    "rag-fiscal":       {"accuracy": 0.75, "label": "RAG fiscal CH"},
    "json-wizard":      {"accuracy": 0.90, "label": "JSON wizard"},
    "chat-streaming":   {"accuracy": 0.70, "label": "Chat streaming"},
    "classifier-kafer": {"accuracy": 0.85, "label": "Käfer classifier"},
}

PERF_THRESHOLDS = {
    "ttft_p50_ms": 2000,
    "tps_p50": 20,
    "e2e_p95_ms": 30000,
}


def parse_report_md(path: Path) -> dict:
    """Parse a markdown report to extract key metrics."""
    text = path.read_text()
    result = {"file": path.name, "raw": text}

    # Extract overall accuracy
    m = re.search(r"Accuracy globale.*?(\d+)/(\d+)", text)
    if m:
        result["correct"] = int(m.group(1))
        result["total"] = int(m.group(2))
        result["accuracy"] = result["correct"] / result["total"]

    # Extract TTFT p50
    m = re.search(r"TTFT.*?p50.*?(\d+)\s*ms", text, re.IGNORECASE)
    if m:
        result["ttft_p50_ms"] = int(m.group(1))

    # Extract tokens/s p50
    m = re.search(r"tokens/s.*?p50.*?([\d.]+)", text, re.IGNORECASE)
    if not m:
        m = re.search(r"p50.*?tok.*?([\d.]+)", text, re.IGNORECASE)
    if m:
        result["tps_p50"] = float(m.group(1))

    # Extract E2E p95
    m = re.search(r"[Ll]atence.*?p95.*?(\d+)\s*ms", text, re.IGNORECASE)
    if not m:
        m = re.search(r"E2E.*?p95.*?(\d+)\s*ms", text, re.IGNORECASE)
    if m:
        result["e2e_p95_ms"] = int(m.group(1))

    # Per-category accuracy
    result["categories"] = {}
    for cat, meta in THRESHOLDS.items():
        m = re.search(
            rf"{re.escape(meta['label'])}.*?(\d+)/(\d+)", text, re.IGNORECASE
        )
        if not m:
            m = re.search(rf"{re.escape(cat)}.*?(\d+)/(\d+)", text, re.IGNORECASE)
        if m:
            correct = int(m.group(1))
            total = int(m.group(2))
            result["categories"][cat] = {
                "correct": correct,
                "total": total,
                "accuracy": correct / total if total > 0 else 0,
                "pass": (correct / total >= meta["accuracy"]) if total > 0 else False,
            }

    return result


def parse_results_json(path: Path) -> dict:
    """Parse JSON results file for more accurate metrics."""
    data = json.loads(path.read_text())

    result = {}
    ttfts = []
    tps_list = []
    e2e_list = []
    correct_total = 0
    total = 0
    categories = {}

    for case in data.get("results", []):
        total += 1
        # Structure: case.eval.score (float 0-1), case.eval.pass (bool)
        eval_data = case.get("eval", {})
        perf_data = case.get("perf", {})
        score = eval_data.get("score", case.get("score", 0))
        passed = eval_data.get("pass", score >= 1.0)
        correct_total += 1 if passed else 0

        ttft = perf_data.get("ttft_ms", case.get("ttft_ms"))
        if ttft and ttft > 0:
            ttfts.append(ttft)

        tps = perf_data.get("tokens_per_sec", case.get("tokens_per_sec"))
        if tps and tps > 0:
            tps_list.append(tps)

        total_ms = perf_data.get("total_ms", case.get("latency_ms"))
        if total_ms and total_ms > 0:
            e2e_list.append(total_ms)

        cat = case.get("category", "")
        if cat not in categories:
            categories[cat] = {"correct": 0, "total": 0}
        categories[cat]["total"] += 1
        if passed:
            categories[cat]["correct"] += 1

    result["correct"] = correct_total
    result["total"] = total
    result["accuracy"] = correct_total / total if total > 0 else 0

    def percentile(lst, p):
        if not lst:
            return None
        s = sorted(lst)
        idx = int(len(s) * p / 100)
        return s[min(idx, len(s) - 1)]

    result["ttft_p50_ms"] = percentile(ttfts, 50)
    result["ttft_p95_ms"] = percentile(ttfts, 95)
    result["tps_p50"] = percentile(tps_list, 50)
    result["tps_p95"] = percentile(tps_list, 95)
    result["e2e_p50_ms"] = percentile(e2e_list, 50)
    result["e2e_p95_ms"] = percentile(e2e_list, 95)

    result["categories"] = {}
    for cat, vals in categories.items():
        thresh = THRESHOLDS.get(cat, {}).get("accuracy", 0.75)
        acc = vals["correct"] / vals["total"] if vals["total"] > 0 else 0
        result["categories"][cat] = {
            "correct": vals["correct"],
            "total": vals["total"],
            "accuracy": acc,
            "pass": acc >= thresh,
        }

    return result


def verdict(metrics: dict, is_baseline: bool = False) -> str:
    """Return PASS/FAIL/INCOMPATIBLE verdict."""
    # INCOMPATIBLE = no results at all (load failed or checkpoint error)
    if metrics.get("total", 0) <= 0:
        return "INCOMPATIBLE"

    # If it ran but got 0%, that's FAIL (not incompatible — the model worked, just poorly)
    acc = metrics.get("accuracy", 0)

    # Check per-category thresholds
    cats_fail = []
    for cat, thresh in THRESHOLDS.items():
        cat_data = metrics.get("categories", {}).get(cat, {})
        if cat_data and not cat_data.get("pass", True):
            cats_fail.append(cat)

    if cats_fail or acc < 0.80:
        return "FAIL"

    return "BASELINE" if is_baseline else "PASS"


def fmt_ms(v):
    if v is None:
        return "N/A"
    return f"{v:.0f}ms"

def fmt_tps(v):
    if v is None:
        return "N/A"
    return f"{v:.1f}"

def fmt_pct(v):
    if v is None:
        return "N/A"
    return f"{v*100:.1f}%"

def emoji_verdict(v: str) -> str:
    return {
        "PASS": "✅",
        "FAIL": "❌",
        "INCOMPATIBLE": "🚫",
        "BASELINE": "🏆",
        "INTERRUPTED": "⚠️",
        "SKIP": "⏭️",
    }.get(v, "❓")


def main():
    print(f"Scanning {REPORTS_DIR} for reports...")

    # Collect all results
    model_results = {}

    # Parse JSON results (more accurate)
    for json_file in sorted(REPORTS_DIR.glob("results_*.json")):
        slug = json_file.stem.replace("results_", "").rsplit("_", 1)[0]
        # Remove date suffix (YYYY-MM-DD)
        slug = re.sub(r"_\d{4}-\d{2}-\d{2}$", "", slug)
        print(f"  Parsing JSON: {json_file.name} → slug={slug}")
        try:
            model_results[slug] = parse_results_json(json_file)
            model_results[slug]["source"] = "json"
        except Exception as e:
            print(f"  ERROR: {e}")

    # Parse MD reports (fallback / supplement)
    for md_file in sorted(REPORTS_DIR.glob("report_*.md")):
        if md_file.name == "SUMMARY.md":
            continue
        slug = md_file.stem.replace("report_", "").rsplit("_", 1)[0]
        slug = re.sub(r"_\d{4}-\d{2}-\d{2}$", "", slug)
        print(f"  Parsing MD: {md_file.name} → slug={slug}")
        if slug not in model_results:
            try:
                model_results[slug] = parse_report_md(md_file)
                model_results[slug]["source"] = "md"
            except Exception as e:
                print(f"  ERROR: {e}")

    # Load VRAM data
    vram_data = {}
    vram_file = REPORTS_DIR / "vram_peaks.txt"
    if vram_file.exists():
        for line in vram_file.read_text().splitlines():
            parts = line.strip().split("|")
            if len(parts) >= 4:
                model_name = parts[1]
                # Find slug for this model name
                for slug, meta in MODEL_META.items():
                    if meta["name"] == model_name:
                        vram_data[slug] = {"before": parts[2], "after": parts[3]}

    # Load bench status — BENCH_STATUS_RERUN overrides BENCH_STATUS
    status_overrides = {}
    status_file = REPORTS_DIR / "bench_status.txt"
    if status_file.exists():
        for line in status_file.read_text().splitlines():
            parts = line.strip().split("|")
            # Process BENCH_STATUS lines (original run)
            if parts[0] == "BENCH_STATUS" and len(parts) >= 3:
                model_name = parts[1]
                status = parts[2]
                for slug, meta in MODEL_META.items():
                    if meta["name"] == model_name:
                        if status == "LOAD_FAILED":
                            status_overrides[slug] = "INCOMPATIBLE"
                        elif status == "143":  # SIGTERM = interrupted
                            if slug not in status_overrides:
                                status_overrides[slug] = "INTERRUPTED"
            # BENCH_STATUS_RERUN overrides previous (re-run is authoritative)
            elif parts[0] == "BENCH_STATUS_RERUN" and len(parts) >= 3:
                model_name = parts[1]
                status = parts[2]
                for slug, meta in MODEL_META.items():
                    if meta["name"] == model_name:
                        # If we have a JSON results file for this model, clear override
                        result_files = list(REPORTS_DIR.glob(f"results_{slug}_*.json"))
                        if result_files:
                            # Results exist — remove INCOMPATIBLE/INTERRUPTED override
                            if slug in status_overrides and status_overrides[slug] in ("INCOMPATIBLE", "INTERRUPTED"):
                                del status_overrides[slug]

    # Build table rows in model order
    model_order = list(MODEL_META.keys())

    rows = []
    baseline_metrics = None

    for slug in model_order:
        meta = MODEL_META[slug]
        is_baseline = "35B-A3B" in slug

        metrics = model_results.get(slug, {})
        override = status_overrides.get(slug)

        if override == "INCOMPATIBLE":
            v = "INCOMPATIBLE"
        elif override == "INTERRUPTED":
            v = "INTERRUPTED"
        elif not metrics:
            v = "SKIP"
        else:
            v = verdict(metrics, is_baseline)

        if is_baseline and metrics:
            baseline_metrics = metrics

        rows.append({
            "slug": slug,
            "meta": meta,
            "metrics": metrics,
            "verdict": v,
            "vram": vram_data.get(slug, {}),
        })

    # Generate SUMMARY.md
    lines = []
    lines.append("# Phase 2 — Benchmark NVFP4 : Résultats")
    lines.append("")
    lines.append(f"**Date** : {datetime.now().strftime('%Y-%m-%d')}  ")
    lines.append("**Plateforme** : DGX GB10 (NVIDIA, 128GB VRAM)  ")
    lines.append("**Dataset** : 60 cas (RAG fiscal CH × 20, JSON wizard × 20, chat streaming × 10, Käfer classifier × 10)  ")
    lines.append("**Harness** : `tasks/phase2-bench/harness/run_benchmark.py`")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Tableau récapitulatif")
    lines.append("")
    lines.append("| # | Modèle | Params | Type | Accuracy | RAG | Wizard | Chat | Käfer | TTFT p50 | tok/s p50 | VRAM | Verdict |")
    lines.append("|---|--------|--------|------|----------|-----|--------|------|-------|----------|-----------|------|---------|")

    for i, row in enumerate(rows, 1):
        meta = row["meta"]
        m = row["metrics"]
        v = row["verdict"]
        ev = emoji_verdict(v)

        acc = fmt_pct(m.get("accuracy")) if m else "—"
        ttft = fmt_ms(m.get("ttft_p50_ms")) if m else "—"
        tps = fmt_tps(m.get("tps_p50")) if m else "—"

        # Per-category
        def cat_cell(cat):
            c = m.get("categories", {}).get(cat, {}) if m else {}
            if not c:
                return "—"
            correct = c.get("correct", 0)
            total = c.get("total", 0)
            pct = fmt_pct(c.get("accuracy"))
            ok = "✅" if c.get("pass") else "❌"
            return f"{ok} {pct}"

        rag = cat_cell("rag-fiscal")
        wizard = cat_cell("json-wizard")
        chat = cat_cell("chat-streaming")
        kafer = cat_cell("classifier-kafer")

        vram_before = row["vram"].get("before", "—")
        vram_after = row["vram"].get("after", "—")
        vram_str = f"{vram_after}" if vram_after and vram_after != "[N/A]" else "—"

        # Short model name
        model_short = meta["name"].split("/")[-1]

        lines.append(
            f"| {i} | `{model_short}` | {meta['params']} | {meta['type']} | "
            f"{acc} | {rag} | {wizard} | {chat} | {kafer} | "
            f"{ttft} | {tps} | {vram_str} | {ev} {v} |"
        )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Détail des verdicts")
    lines.append("")

    for row in rows:
        v = row["verdict"]
        name = row["meta"]["name"]
        ev = emoji_verdict(v)
        m = row["metrics"]

        lines.append(f"### {ev} {name}")
        lines.append("")

        if v == "INCOMPATIBLE":
            slug = row["slug"]
            if "AxionML" in slug or "27B" in slug:
                lines.append("**Raison** : Checkpoint NVFP4 incompatible — paramètres `linear_attn.in_proj_ba.weight` manquants dans les couches du modèle. Architecture `Qwen3_5ForConditionalGeneration` non supportée par les checkpoints disponibles.")
            elif "Marlin" in slug or "27B" in slug:
                lines.append("**Raison** : Crash Marlin GPTQ kernel — `size_n not divisible by tile_n_size`. Incompatibilité architecture/quantization.")
            else:
                lines.append("**Raison** : Checkpoint incompatible avec vLLM ou paramètres manquants.")
        elif v == "INTERRUPTED":
            lines.append("**Raison** : Benchmark interrompu (SIGTERM mid-run) pour correction du harness (mode reasoning désactivé). Re-run nécessaire.")
        elif v == "SKIP":
            lines.append("**Raison** : Aucun résultat disponible — modèle non testé ou service non démarré.")
        elif m:
            acc = m.get("accuracy", 0)
            lines.append(f"- **Accuracy globale** : {fmt_pct(acc)} ({m.get('correct', '?')}/{m.get('total', '?')})")
            lines.append(f"- **TTFT p50** : {fmt_ms(m.get('ttft_p50_ms'))}")
            lines.append(f"- **tok/s p50** : {fmt_tps(m.get('tps_p50'))}")
            lines.append(f"- **Latence E2E p95** : {fmt_ms(m.get('e2e_p95_ms'))}")
            lines.append("")
            lines.append("**Par catégorie :**")
            for cat, thresh_data in THRESHOLDS.items():
                cat_data = m.get("categories", {}).get(cat, {})
                if cat_data:
                    ok = "✅" if cat_data.get("pass") else "❌"
                    lines.append(
                        f"  - {ok} {thresh_data['label']}: {cat_data['correct']}/{cat_data['total']} "
                        f"({fmt_pct(cat_data['accuracy'])}, seuil={fmt_pct(thresh_data['accuracy'])})"
                    )

        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Seuils de déploiement")
    lines.append("")
    lines.append("| Critère | Seuil | Notes |")
    lines.append("|---------|-------|-------|")
    lines.append("| Accuracy globale | ≥ 80% | Aucune régression vs baseline |")
    lines.append("| RAG fiscal CH | ≥ 75% | Tolérance variations juridiques |")
    lines.append("| JSON wizard | ≥ 90% | Zéro erreur comptable |")
    lines.append("| Chat streaming | ≥ 70% | Conversations ouvertes |")
    lines.append("| Käfer classifier | ≥ 85% | Règles R1-R6 critiques |")
    lines.append("| TTFT p50 | ≤ 2 000 ms | Réactivité streaming perçue |")
    lines.append("| tok/s p50 | ≥ 20 | Fluidité génération |")
    lines.append("| E2E p95 | ≤ 30 000 ms | Timeout UX acceptable |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Recommandation")
    lines.append("")

    # Find best model
    pass_models = [r for r in rows if r["verdict"] in ("PASS", "BASELINE") and r["metrics"]]
    if pass_models:
        # Sort by accuracy desc, then tps desc
        pass_models.sort(
            key=lambda r: (
                r["metrics"].get("accuracy", 0),
                r["metrics"].get("tps_p50", 0),
            ),
            reverse=True,
        )
        best = pass_models[0]
        lines.append(f"**Modèle recommandé** : `{best['meta']['name']}`")
        lines.append("")
        m = best["metrics"]
        lines.append(f"- Accuracy : {fmt_pct(m.get('accuracy'))}")
        lines.append(f"- TTFT p50 : {fmt_ms(m.get('ttft_p50_ms'))}")
        lines.append(f"- tok/s p50 : {fmt_tps(m.get('tps_p50'))}")
        lines.append("")
        if best["verdict"] == "BASELINE":
            lines.append("Le baseline actuel reste le meilleur choix — aucun challenger ne le dépasse sur tous les critères.")
        else:
            lines.append("Ce modèle offre le meilleur ratio qualité/performance parmi les candidats testés.")
    else:
        lines.append("**Aucun modèle challenger ne satisfait tous les critères de déploiement.**")
        lines.append("")
        lines.append("Le baseline `apolo13x/Qwen3.5-35B-A3B-NVFP4` reste le modèle de production recommandé.")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("*Généré automatiquement par `tasks/phase2-bench/harness/generate_summary.py`*")

    out = REPORTS_DIR / "SUMMARY.md"
    out.write_text("\n".join(lines) + "\n")
    print(f"\nSUMMARY.md written to: {out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
