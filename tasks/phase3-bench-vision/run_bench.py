#!/usr/bin/env python3
"""Bench vision OCR — vLLM Qwen3-VL vs Ollama qwen3-vl-ocr.

Mesure latence et précision d'extraction sur 20 documents synthétiques.
"""
import argparse
import base64
import json
import re
import statistics
import time
from pathlib import Path

import requests

DATASET = Path(__file__).parent / "dataset"
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
    match = re.search(r"\{.*\}", s, re.DOTALL)
    if match:
        s = match.group(0)
    try:
        return json.loads(s)
    except Exception:
        return {}


def score(extracted: dict, ground_truth: dict) -> tuple[float, list[str]]:
    """Retourne (score 0-1, liste des champs KO)."""
    expected = {k: v for k, v in ground_truth.items() if k != "category"}
    correct = 0
    errors = []
    for k, v_exp in expected.items():
        v_got = extracted.get(k)
        if isinstance(v_exp, (int, float)) and isinstance(v_got, (int, float)):
            # Tolérance numérique ±1%
            ok = abs(v_got - v_exp) / max(abs(v_exp), 1) < 0.01
        elif isinstance(v_exp, str) and isinstance(v_got, str):
            # String match insensible casse + espaces
            ok = v_got.lower().strip() == v_exp.lower().strip() or v_exp.lower() in v_got.lower()
        else:
            ok = v_got == v_exp
        if ok:
            correct += 1
        else:
            errors.append(f"{k}: expected={v_exp!r} got={v_got!r}")
    return correct / len(expected), errors


def call_ollama(image_b64: str, prompt: str, timeout: int = 150) -> tuple[str, float]:
    t0 = time.time()
    r = requests.post(
        OLLAMA_URL,
        json={
            "model": "qwen3-vl-ocr",
            "messages": [{"role": "user", "content": prompt, "images": [image_b64]}],
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


def call_vllm(image_b64: str, prompt: str, timeout: int = 150) -> tuple[str, float]:
    t0 = time.time()
    r = requests.post(
        VLLM_URL,
        json={
            "model": "Qwen/Qwen3-VL-8B-Instruct-FP8",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
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


def bench_backend(backend: str, call_fn) -> dict:
    print(f"\n=== Bench {backend} ===")
    results = []
    for case in GT:
        path = DATASET / case["file"]
        gt = case["ground_truth"]
        prompt = PROMPTS[gt["category"]]
        b64 = base64.b64encode(path.read_bytes()).decode()
        try:
            raw, dt = call_fn(b64, prompt)
            parsed = parse_json_loose(raw)
            acc, errs = score(parsed, gt)
        except Exception as e:
            raw, dt, parsed, acc, errs = str(e), 0, {}, 0, [f"exception: {e}"]
        results.append({
            "file": case["file"],
            "category": gt["category"],
            "duration_s": round(dt, 1),
            "accuracy": round(acc, 2),
            "errors": errs[:3],
            "raw_sample": raw[:200],
        })
        print(f"  {case['file']:20s} {dt:5.1f}s acc={acc:.0%} {'✓' if acc >= 0.9 else '⚠' if acc >= 0.5 else '✗'}")
    agg = {
        "backend": backend,
        "n": len(results),
        "avg_accuracy": round(statistics.mean([r["accuracy"] for r in results]), 3),
        "avg_duration_s": round(statistics.mean([r["duration_s"] for r in results if r["duration_s"] > 0]), 1),
        "median_duration_s": round(statistics.median([r["duration_s"] for r in results if r["duration_s"] > 0]), 1),
        "p95_duration_s": round(sorted([r["duration_s"] for r in results])[int(len(results) * 0.95) - 1], 1),
        "by_category": {},
        "results": results,
    }
    for cat in ["salary", "3a", "invoice"]:
        r_cat = [r for r in results if r["category"] == cat]
        if r_cat:
            agg["by_category"][cat] = {
                "avg_accuracy": round(statistics.mean([r["accuracy"] for r in r_cat]), 3),
                "avg_duration_s": round(statistics.mean([r["duration_s"] for r in r_cat if r["duration_s"] > 0]), 1),
            }
    return agg


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["ollama", "vllm", "both"], default="both")
    parser.add_argument("--output", default="results.json")
    args = parser.parse_args()

    out = {}
    if args.only in ("ollama", "both"):
        out["ollama"] = bench_backend("ollama-qwen3-vl-ocr", call_ollama)
    if args.only in ("vllm", "both"):
        out["vllm"] = bench_backend("vllm-qwen3-vl-8b-fp8", call_vllm)

    Path(args.output).write_text(json.dumps(out, indent=2, ensure_ascii=False, default=str))
    print(f"\nResults → {args.output}")
    print("\nSUMMARY")
    for k, v in out.items():
        print(f"  {k}: accuracy={v['avg_accuracy']:.1%} avg={v['avg_duration_s']}s p95={v['p95_duration_s']}s")


if __name__ == "__main__":
    main()
