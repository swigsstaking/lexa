#!/usr/bin/env python3
"""Bench v2 — mesure robustesse du modèle OCR face à des dégradations réalistes.

Réutilise la logique de run_bench.py mais :
- charge dataset_v2/ (50 docs avec levels clean/soft/rough)
- stats par niveau de dégradation
- compare les 2 backends sur le même dataset v2
"""
import argparse
import base64
import json
import re
import statistics
import time
from collections import defaultdict
from pathlib import Path

import requests

DATASET = Path(__file__).parent / "dataset_v2"
GT = json.load((DATASET / "ground_truth.json").open())

OLLAMA_URL = "http://192.168.110.103:11434/api/chat"
VLLM_URL = "http://192.168.110.103:8101/v1/chat/completions"

PROMPTS = {
    "salary": """Tu es un assistant OCR specialise dans les certificats de salaire suisses. Extrais les champs, retourne UNIQUEMENT du JSON valide:
{
  "employer_name": string,
  "employer_uid": string,
  "employee_name": string,
  "year": number,
  "gross_annual_salary": number,
  "bonus": number,
  "ahv_ai_apg": number,
  "lpp_employee": number
}""",
    "3a": """Tu es un assistant OCR pour attestations pilier 3a suisses. Extrais les champs, retourne UNIQUEMENT du JSON valide:
{
  "institution": string,
  "contributor_name": string,
  "year": number,
  "amount": number
}""",
    "invoice": """Tu es un assistant OCR pour factures suisses. Extrais les champs, retourne UNIQUEMENT du JSON valide:
{
  "vendor": string,
  "invoice_number": string,
  "date": "YYYY-MM-DD",
  "amount_ht": number,
  "tva": number,
  "amount_ttc": number
}""",
}


def parse_json_loose(s: str) -> dict:
    s = s.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        s = m.group(0)
    try:
        return json.loads(s)
    except Exception:
        return {}


def score(extracted: dict, ground_truth: dict) -> tuple[float, list[str]]:
    expected = {k: v for k, v in ground_truth.items() if not k.startswith("_") and k != "category"}
    correct = 0
    errors = []
    for k, v_exp in expected.items():
        v_got = extracted.get(k)
        if isinstance(v_exp, (int, float)) and isinstance(v_got, (int, float)):
            ok = abs(v_got - v_exp) / max(abs(v_exp), 1) < 0.01
        elif isinstance(v_exp, str) and isinstance(v_got, str):
            ok = v_got.lower().strip() == v_exp.lower().strip() or v_exp.lower() in v_got.lower()
        else:
            ok = v_got == v_exp
        if ok:
            correct += 1
        else:
            errors.append(f"{k}: expected={v_exp!r} got={v_got!r}")
    return correct / len(expected), errors


def call_ollama(b64: str, prompt: str, timeout: int = 240) -> tuple[str, float]:
    t0 = time.time()
    try:
        r = requests.post(
            OLLAMA_URL,
            json={
                "model": "qwen3-vl-ocr",
                "messages": [{"role": "user", "content": prompt, "images": [b64]}],
                "stream": False,
                "think": False,
                "keep_alive": "30m",
                "options": {"temperature": 0, "num_predict": 2048, "num_ctx": 8192},
            },
            timeout=timeout,
        )
        dt = time.time() - t0
        if not r.ok:
            return f"HTTP {r.status_code}: {r.text[:200]}", dt
        return r.json().get("message", {}).get("content", ""), dt
    except Exception as e:
        return f"EXCEPTION {type(e).__name__}: {e}", time.time() - t0


def call_vllm(b64: str, prompt: str, timeout: int = 60) -> tuple[str, float]:
    t0 = time.time()
    try:
        r = requests.post(
            VLLM_URL,
            json={
                "model": "Qwen/Qwen3-VL-8B-Instruct-FP8",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                        ],
                    }
                ],
                "temperature": 0,
                "max_tokens": 2048,
            },
            timeout=timeout,
        )
        dt = time.time() - t0
        if not r.ok:
            return f"HTTP {r.status_code}: {r.text[:200]}", dt
        return r.json().get("choices", [{}])[0].get("message", {}).get("content", ""), dt
    except Exception as e:
        return f"EXCEPTION {type(e).__name__}: {e}", time.time() - t0


def bench_backend(backend: str, call_fn) -> dict:
    print(f"\n=== Bench {backend} ===")
    results = []
    for case in GT:
        path = DATASET / case["file"]
        gt = case["ground_truth"]
        level = gt["_level"]
        prompt = PROMPTS[gt["category"]]
        b64 = base64.b64encode(path.read_bytes()).decode()
        raw, dt = call_fn(b64, prompt)
        parsed = parse_json_loose(raw)
        acc, errs = score(parsed, gt)
        results.append({
            "file": case["file"],
            "category": gt["category"],
            "level": level,
            "duration_s": round(dt, 1),
            "accuracy": round(acc, 2),
            "errors": errs[:3],
        })
        marker = "✓" if acc >= 0.9 else "⚠" if acc >= 0.5 else "✗"
        print(f"  {case['file']:30s} [{level:5s}] {dt:5.1f}s acc={acc:.0%} {marker}")

    # Stats par level
    by_level: dict[str, list[dict]] = defaultdict(list)
    by_category: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        by_level[r["level"]].append(r)
        by_category[r["category"]].append(r)

    def agg(items: list[dict]) -> dict:
        if not items:
            return {}
        accs = [x["accuracy"] for x in items]
        durs = [x["duration_s"] for x in items if x["duration_s"] > 0]
        return {
            "n": len(items),
            "avg_accuracy": round(statistics.mean(accs), 3),
            "avg_duration_s": round(statistics.mean(durs), 1) if durs else 0,
            "pass_rate_90": round(sum(1 for a in accs if a >= 0.9) / len(accs), 2),
        }

    return {
        "backend": backend,
        "n": len(results),
        "overall": agg(results),
        "by_level": {k: agg(v) for k, v in by_level.items()},
        "by_category": {k: agg(v) for k, v in by_category.items()},
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["ollama", "vllm", "both"], default="both")
    parser.add_argument("--output", default="results_v2.json")
    args = parser.parse_args()

    out = {}
    if args.only in ("vllm", "both"):
        out["vllm"] = bench_backend("vllm-qwen3-vl-8b-fp8", call_vllm)
    if args.only in ("ollama", "both"):
        out["ollama"] = bench_backend("ollama-qwen3-vl-ocr", call_ollama)

    Path(args.output).write_text(json.dumps(out, indent=2, ensure_ascii=False, default=str))
    print(f"\nResults → {args.output}")
    print("\nSUMMARY par backend")
    for k, v in out.items():
        ov = v["overall"]
        print(f"  {k}: acc={ov['avg_accuracy']:.1%} pass≥90%={ov['pass_rate_90']:.0%} avg={ov['avg_duration_s']}s")
        for lvl, st in v["by_level"].items():
            print(f"     [{lvl:5s}] n={st['n']:2d} acc={st['avg_accuracy']:.1%} pass≥90%={st['pass_rate_90']:.0%}")


if __name__ == "__main__":
    main()
