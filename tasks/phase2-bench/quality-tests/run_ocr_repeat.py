#!/usr/bin/env python3
"""
run_ocr_repeat.py — Harness cohérence OCR Lexa

Upload le même document N fois sur /api/documents/upload et mesure la variance
des champs extraits (ocrResult.extractedFields) + la similarité des texte bruts.

Objectif : détecter les extractions non-reproductibles (Qwen3-VL non-déterministe)
et flagger les documents où le mapping auto-fill du wizard serait instable.

Usage :
    python run_ocr_repeat.py --file fixtures/test-cert-salaire.pdf --repeat 3
    python run_ocr_repeat.py --file fixtures/test-cert-salaire-1.png --repeat 5 --type certificat_salaire
"""

import argparse
import base64
import json
import os
import statistics
import sys
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Optional

try:
    import requests
except ImportError:
    print("[ERREUR] 'requests' non installé. pip install requests", file=sys.stderr)
    sys.exit(1)


BASE_URL = os.environ.get("LEXA_API_URL", "https://lexa.swigs.online")
JWT_TOKEN = os.environ.get("LEXA_JWT", "")
TIMEOUT_S = 180
REPORT_DIR = Path(__file__).parent


def extract_tenant_from_jwt(token: str) -> Optional[str]:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
        return payload.get("activeTenantId") or payload.get("tenantId")
    except Exception:
        return None


def upload_document(file_path: Path, tenant_id: str) -> dict:
    """Upload le document et retourne { ocrResult, durationMs, error? }."""
    url = BASE_URL.rstrip("/") + "/api/documents/upload"
    headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
    if tenant_id:
        headers["X-Tenant-Id"] = tenant_id

    with open(file_path, "rb") as fp:
        files = {"file": (file_path.name, fp, _guess_mime(file_path))}
        t0 = time.perf_counter()
        try:
            resp = requests.post(url, headers=headers, files=files, timeout=TIMEOUT_S)
            duration = (time.perf_counter() - t0) * 1000
            if resp.status_code != 200:
                return {
                    "error": f"HTTP {resp.status_code}: {resp.text[:400]}",
                    "durationMs": duration,
                    "ocrResult": None,
                    "documentId": None,
                }
            data = resp.json()
            return {
                "ocrResult": data.get("ocrResult"),
                "documentId": data.get("documentId"),
                "durationMs": duration,
                "error": None,
            }
        except requests.exceptions.Timeout:
            return {
                "error": f"Timeout après {TIMEOUT_S}s",
                "durationMs": (time.perf_counter() - t0) * 1000,
                "ocrResult": None,
                "documentId": None,
            }
        except Exception as e:
            return {
                "error": f"Exception: {e}",
                "durationMs": (time.perf_counter() - t0) * 1000,
                "ocrResult": None,
                "documentId": None,
            }


def _guess_mime(file_path: Path) -> str:
    ext = file_path.suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }.get(ext, "application/octet-stream")


def field_consensus(field_values: list) -> tuple:
    """Retourne (valeur_majoritaire, fraction) pour une liste de valeurs.

    Gère None, types divers. Fraction = part du total partageant la valeur modale.
    """
    if not field_values:
        return None, 0.0
    normalized = [json.dumps(v, sort_keys=True, ensure_ascii=False) if v is not None else None
                  for v in field_values]
    counts: dict = {}
    for n in normalized:
        counts[n] = counts.get(n, 0) + 1
    top_key, top_count = max(counts.items(), key=lambda kv: kv[1])
    idx = normalized.index(top_key)
    return field_values[idx], top_count / len(field_values)


def compare_extractions(ocr_results: list) -> dict:
    """Compare N résultats OCR et retourne stats de reproductibilité."""
    ok_results = [r for r in ocr_results if r.get("ocrResult")]
    if len(ok_results) < 2:
        return {
            "comparable": False,
            "reason": f"Seulement {len(ok_results)} upload(s) réussi(s)",
        }

    # Similarité des rawText
    raw_texts = [r["ocrResult"].get("rawText", "") for r in ok_results]
    sims = []
    for i in range(len(raw_texts)):
        for j in range(i + 1, len(raw_texts)):
            sims.append(SequenceMatcher(None, raw_texts[i], raw_texts[j]).ratio())
    raw_similarity = statistics.mean(sims) if sims else 1.0

    # Types détectés
    types = [r["ocrResult"].get("type", "autre") for r in ok_results]
    type_consensus, type_agreement = field_consensus(types)

    # Champs extraits — union des clés, puis consensus par clé
    all_keys: set = set()
    for r in ok_results:
        fields = r["ocrResult"].get("extractedFields") or {}
        all_keys.update(fields.keys())

    field_stability: dict = {}
    for key in sorted(all_keys):
        values = [(r["ocrResult"].get("extractedFields") or {}).get(key) for r in ok_results]
        consensus_val, frac = field_consensus(values)
        field_stability[key] = {
            "consensus_value": consensus_val,
            "agreement": round(frac, 3),
            "all_values": values,
        }

    stable_fields = sum(1 for v in field_stability.values() if v["agreement"] >= 0.8)
    total_fields = len(field_stability)
    field_stable_pct = stable_fields / total_fields if total_fields else 1.0

    confidences = [r["ocrResult"].get("ocrConfidence", 0) for r in ok_results]

    return {
        "comparable": True,
        "n_runs": len(ok_results),
        "raw_similarity": round(raw_similarity, 3),
        "type_consensus": type_consensus,
        "type_agreement": round(type_agreement, 3),
        "total_fields": total_fields,
        "stable_fields": stable_fields,
        "field_stable_pct": round(field_stable_pct, 3),
        "field_stability": field_stability,
        "confidence_avg": round(statistics.mean(confidences), 3) if confidences else 0,
        "confidence_stdev": round(statistics.pstdev(confidences), 3) if len(confidences) > 1 else 0,
    }


def run(file_path: Path, repeat: int, tenant_id: str) -> dict:
    print(f"\n{'='*60}")
    print(f"OCR REPEAT — {file_path.name} × {repeat} runs")
    print(f"{'='*60}")
    print(f"Endpoint : {BASE_URL}/api/documents/upload")
    print(f"Tenant   : {tenant_id or '(depuis JWT)'}")
    print()

    runs = []
    for i in range(repeat):
        print(f"  [{i+1}/{repeat}] upload …", end="", flush=True)
        result = upload_document(file_path, tenant_id)
        if result.get("error"):
            print(f" ✗ {result['error'][:80]}")
        else:
            ocr = result.get("ocrResult") or {}
            fields_count = len((ocr.get("extractedFields") or {}))
            print(f" ✓ {result['durationMs']:.0f}ms | "
                  f"type={ocr.get('type','?')} | "
                  f"conf={ocr.get('ocrConfidence', 0):.2f} | "
                  f"{fields_count} champs | doc_id={result.get('documentId','?')[:8]}")
        runs.append(result)

    comparison = compare_extractions(runs)

    print()
    print("─── Analyse cohérence ───")
    if not comparison.get("comparable"):
        print(f"  Non comparable : {comparison.get('reason')}")
    else:
        print(f"  rawText similarité      : {comparison['raw_similarity']:.2f}")
        print(f"  Type consensus          : {comparison['type_consensus']} "
              f"({comparison['type_agreement']:.0%} d'accord)")
        print(f"  Champs stables (≥80%)   : {comparison['stable_fields']}/{comparison['total_fields']} "
              f"({comparison['field_stable_pct']:.0%})")
        print(f"  Confiance moyenne       : {comparison['confidence_avg']:.2f} "
              f"(écart-type {comparison['confidence_stdev']:.3f})")
        # Champs instables
        unstable = [(k, v) for k, v in comparison["field_stability"].items() if v["agreement"] < 0.8]
        if unstable:
            print(f"  ⚠ Champs instables ({len(unstable)}) :")
            for k, v in unstable[:10]:
                vals_str = " | ".join([repr(x)[:30] for x in v["all_values"]])
                print(f"     - {k} (agreement {v['agreement']:.0%}) → {vals_str}")
        else:
            print(f"  ✓ Tous les champs sont stables entre runs")

    return {
        "meta": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "endpoint": BASE_URL,
            "file": str(file_path),
            "repeat": repeat,
            "tenant_id": tenant_id,
        },
        "runs": runs,
        "comparison": comparison,
    }


def main():
    ap = argparse.ArgumentParser(description="Bench cohérence OCR — upload répété d'un même document")
    ap.add_argument("--file", type=Path, required=True, help="Chemin du document à uploader")
    ap.add_argument("--repeat", type=int, default=3, help="Nombre d'uploads (défaut 3)")
    ap.add_argument("--output", type=Path, default=REPORT_DIR / "ocr_repeat_results.json",
                    help="JSON de sortie")
    ap.add_argument("--tenant-id", default=None, help="Override tenantId (sinon extrait du JWT)")
    args = ap.parse_args()

    if not JWT_TOKEN:
        print("[ERREUR] LEXA_JWT manquant dans l'env", file=sys.stderr)
        sys.exit(2)

    if not args.file.exists():
        print(f"[ERREUR] Fichier introuvable : {args.file}", file=sys.stderr)
        sys.exit(2)

    tenant_id = args.tenant_id or extract_tenant_from_jwt(JWT_TOKEN) or ""

    report = run(args.file, args.repeat, tenant_id)

    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(f"\nRésultats JSON : {args.output}")

    # Exit code non-zero si champs instables majoritaires
    comp = report.get("comparison", {})
    if comp.get("comparable") and comp.get("field_stable_pct", 1.0) < 0.5:
        print("⚠ Plus de 50% des champs sont instables — extraction peu reproductible.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
