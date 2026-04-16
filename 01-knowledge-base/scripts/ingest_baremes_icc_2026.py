#!/usr/bin/env python3
"""
Lexa — Ingestion barèmes ICC officiels 2026 — 4 cantons × PP + PM = 8 points Qdrant (Lane B S32).

Source : Fichiers YAML dans 01-knowledge-base/baremes/*-2026.yaml
  - vs-pp-2026.yaml : VS Loi fiscale Art. 32 (source: high confidence)
  - vs-pm-2026.yaml : VS LF Arts. 89, 99, 93, 100, 180a (source: high)
  - ge-pp-2026.yaml : GE LIPP Art. 41 barème complet (source: high)
  - ge-pm-2026.yaml : GE LIPM Arts. 20, 33, 34, 36 (source: high)
  - vd-pp-2026.yaml : VD LI Art. 47 (tranches: medium — barème fixé par CE)
  - vd-pm-2026.yaml : VD LI Arts. 105, 111, 118 (source: high)
  - fr-pp-2026.yaml : FR LICD barème SCC délégué (tranches: medium)
  - fr-pm-2026.yaml : FR LICD §licd_fr (source: high)

Cible : swiss_law 9846 → 9854 points (+8)
Idempotent : IDs stables basés sur "bareme-{canton}-{entity}-{year}" (hash unsigned 63-bit)

Usage :
  python3 ingest_baremes_icc_2026.py [--baremes-dir /path/to/baremes] [--dry-run]

Déploiement Spark :
  scp ingest_baremes_icc_2026.py swigs@192.168.110.59:/home/swigs/
  scp -r baremes/ swigs@192.168.110.59:/home/swigs/baremes_icc_2026/
  ssh swigs@192.168.110.59 'python3 /home/swigs/ingest_baremes_icc_2026.py --baremes-dir /home/swigs/baremes_icc_2026'
"""

import sys
import json
import time
import argparse
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

QDRANT_URL = "http://192.168.110.103:6333"
EMBEDDER_URL = "http://192.168.110.103:8082"
COLLECTION = "swiss_law"

# ID stable = hash 63-bit unsigned de la clé canonique
def stable_id(canton: str, entity: str, year: int) -> int:
    key = f"bareme-{canton.upper()}-{entity.upper()}-{year}"
    return hash(key) & 0x7FFFFFFFFFFFFFFF


def yaml_load(path: Path) -> dict:
    """Charge un YAML sans dépendance externe si PyYAML absent."""
    if HAS_YAML:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)
    # Fallback minimaliste : eval interdit, on parse manuellement les champs clés
    raise ImportError("PyYAML requis. Installer via: pip3 install pyyaml")


def yaml_to_text(data: dict) -> str:
    """Transforme un YAML barème en texte indexable pour RAG."""
    canton = data.get("canton", "?")
    entity = data.get("entity", "?")
    year = data.get("year", "?")
    source = data.get("source", {})
    law = source.get("law", "loi fiscale cantonale")
    confidence = source.get("confidence", "medium")

    parts = [
        f"Barème ICC {canton} {entity} {year}",
        f"Source : {law}",
        f"Autorité : {source.get('authority', '?')}",
        f"Confiance source : {confidence}",
        "",
    ]

    if entity == "PP":
        # Barème PP
        tarif = data.get("tarif_single") or data.get("tarif_cantonal") or data.get("tarif_base")
        if tarif:
            parts.append("Tarif célibataire / impôt de base :")
            tranches = tarif.get("tranches", [])
            for t in tranches:
                taux_pct = t.get("rate", 0) * 100
                seuil = t.get("threshold", 0)
                seuil_max = t.get("threshold_max", "")
                if seuil_max:
                    parts.append(f"  Revenu {seuil:,} - {seuil_max:,} CHF : taux {taux_pct:.2f}%")
                else:
                    parts.append(f"  Revenu > {seuil:,} CHF : taux {taux_pct:.2f}%")

        tarif_m = data.get("tarif_married")
        if tarif_m and tarif_m.get("tranches"):
            parts.append("Tarif marié :")
            for t in tarif_m.get("tranches", []):
                taux_pct = t.get("rate", 0) * 100
                parts.append(f"  Revenu > {t.get('threshold', 0):,} CHF : taux {taux_pct:.2f}%")

        fp = data.get("frais_professionnels")
        if fp:
            pct = fp.get("pourcentage", 0) * 100
            min_chf = fp.get("min_chf", "?")
            max_chf = fp.get("max_chf", "?")
            parts.append(
                f"Frais professionnels : {pct:.1f}%, min {min_chf} CHF, max {max_chf} CHF"
            )
            src_fp = fp.get("source", "")
            if src_fp:
                parts.append(f"  Source frais prof : {src_fp}")

        deductions = data.get("deductions")
        if deductions:
            parts.append("Déductions spéciales :")
            for k, v in deductions.items():
                parts.append(f"  {k} : {v}")

    elif entity == "PM":
        # Barème PM — bénéfice
        ib = data.get("impot_benefice", {})
        if ib:
            # Sociétés de capitaux
            if ib.get("structure") == "flat":
                parts.append(
                    f"Impôt bénéfice PM (SA/Sàrl/SC) : {ib.get('rate', 0) * 100:.2f}% flat"
                )
            elif ib.get("structure") == "progressif_par_tranche":
                parts.append("Impôt bénéfice PM (SA/Sàrl/SC) — progressif :")
                for t in ib.get("tranches", []):
                    rate_pct = t.get("rate", 0) * 100
                    seuil = t.get("threshold", 0)
                    seuil_max = t.get("threshold_max", "")
                    if seuil_max:
                        parts.append(f"  Bénéfice {seuil:,} - {seuil_max:,} CHF : {rate_pct:.3f}%")
                    else:
                        parts.append(f"  Bénéfice > {seuil:,} CHF : {rate_pct:.3f}%")
            # Cantonal spécifique (VS)
            cantonal = ib.get("cantonal")
            if cantonal and isinstance(cantonal, dict):
                if cantonal.get("structure") == "progressif_par_tranche":
                    parts.append("Impôt bénéfice cantonal :")
                    for t in cantonal.get("tranches", []):
                        rate_pct = t.get("rate", 0) * 100
                        parts.append(f"  > {t.get('threshold', 0):,} CHF : {rate_pct:.2f}%")
            communal = ib.get("communal")
            if communal and isinstance(communal, dict):
                if communal.get("structure") == "progressif_par_tranche":
                    parts.append("Impôt bénéfice communal :")
                    for t in communal.get("tranches", []):
                        rate_pct = t.get("rate", 0) * 100
                        parts.append(f"  > {t.get('threshold', 0):,} CHF : {rate_pct:.2f}%")
            assoc = ib.get("associations_fondations")
            if assoc and isinstance(assoc, dict):
                rate_pct = assoc.get("rate", 0) * 100
                parts.append(
                    f"Impôt bénéfice associations/fondations : {rate_pct:.2f}% "
                    f"(exonération < {assoc.get('seuil_exoneration_chf', '?')} CHF)"
                )

        # Capital
        ic = data.get("impot_capital", {})
        if ic:
            std = ic.get("standard") or ic
            if isinstance(std, dict) and std.get("rate_permille"):
                parts.append(
                    f"Impôt capital standard : {std.get('rate_permille', 0):.3f}‰"
                )
            cantonal_cap = ic.get("cantonal")
            if cantonal_cap and isinstance(cantonal_cap, dict):
                parts.append("Impôt capital cantonal :")
                for t in cantonal_cap.get("tranches", []):
                    rate_pm = t.get("rate", 0) * 1000
                    parts.append(f"  > {t.get('threshold', 0):,} CHF : {rate_pm:.2f}‰")
            reduit = ic.get("reduit_participations")
            if reduit and isinstance(reduit, dict):
                r = reduit.get("rate_permille") or (reduit.get("pourcentage_base_imposable"))
                parts.append(
                    f"Impôt capital réduit participations : {reduit.get('rate_permille', '?')}‰ "
                    f"(droits participation, prêts groupe)"
                )

    # Note fiscale finale
    note = data.get("note_fiscale") or data.get("note")
    if note:
        parts.append("")
        parts.append(f"Note : {str(note).strip()}")

    # Articles sources
    articles = source.get("articles", [])
    if articles:
        parts.append(f"Articles de référence : {', '.join(str(a) for a in articles)}")

    return "\n".join(parts)


def embed(text: str) -> list:
    """Embed via llama-server (BGE-M3) sur serveur .103."""
    body = json.dumps({"input": [text]}).encode("utf-8")
    req = Request(
        f"{EMBEDDER_URL}/v1/embeddings",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["data"][0]["embedding"]


def upsert_point(point_id: int, vector: list, payload: dict) -> None:
    """Upsert un point dans Qdrant."""
    body = json.dumps(
        {"points": [{"id": point_id, "vector": vector, "payload": payload}]}
    ).encode("utf-8")
    req = Request(
        f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true",
        data=body,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    status = result.get("result", {}).get("status", "?")
    # "completed" et "acknowledged" sont tous deux valides selon la version Qdrant
    if status not in ("ok", "acknowledged", "completed"):
        raise RuntimeError(f"Qdrant upsert status: {status} — {result}")


def get_collection_count() -> int:
    """Retourne le nombre de points dans la collection."""
    req = Request(f"{QDRANT_URL}/collections/{COLLECTION}", method="GET")
    with urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["result"]["points_count"]


def main():
    parser = argparse.ArgumentParser(description="Ingest barèmes ICC 2026 dans Qdrant swiss_law")
    parser.add_argument(
        "--baremes-dir",
        default=str(Path(__file__).parent.parent / "baremes"),
        help="Répertoire contenant les fichiers YAML barèmes",
    )
    parser.add_argument("--dry-run", action="store_true", help="Tester sans écrire dans Qdrant")
    args = parser.parse_args()

    baremes_dir = Path(args.baremes_dir)
    if not baremes_dir.exists():
        print(f"[ERROR] Répertoire barèmes introuvable : {baremes_dir}")
        sys.exit(1)

    yaml_files = sorted(baremes_dir.glob("*-2026.yaml"))
    if not yaml_files:
        print(f"[ERROR] Aucun fichier *-2026.yaml dans {baremes_dir}")
        sys.exit(1)

    print(f"[ingest] Fichiers trouvés : {len(yaml_files)}")
    for f in yaml_files:
        print(f"  - {f.name}")

    # Compte initial
    count_before = get_collection_count()
    print(f"\n[ingest] Points Qdrant avant : {count_before}")

    if args.dry_run:
        print("[ingest] DRY-RUN — pas d'écriture Qdrant")

    ingested = 0
    errors = []

    for yaml_file in yaml_files:
        try:
            data = yaml_load(yaml_file)
        except Exception as e:
            print(f"[ERROR] Chargement YAML {yaml_file.name} : {e}")
            errors.append(yaml_file.name)
            continue

        canton = data.get("canton", "?")
        entity = data.get("entity", "?")
        year = data.get("year", 2026)
        source = data.get("source", {})

        point_id = stable_id(canton, entity, year)
        text = yaml_to_text(data)

        print(f"\n[ingest] {yaml_file.name}")
        print(f"  ID stable : {point_id}")
        print(f"  Texte ({len(text)} chars) :")
        print("  " + text[:200].replace("\n", "\n  ") + "...")

        if args.dry_run:
            print("  [DRY-RUN] Embedding + upsert ignorés")
            continue

        # Embedding
        try:
            vector = embed(text)
            print(f"  Embedding : {len(vector)} dims ✓")
        except Exception as e:
            print(f"  [ERROR] Embedding : {e}")
            errors.append(f"{yaml_file.name} (embed)")
            continue

        # Payload Qdrant
        payload = {
            "law": "baremes-officiels-icc",
            "jurisdiction": f"cantonal-{canton}",
            "canton": canton,
            "topic": "baremes_fiscaux",
            "entity": entity,
            "year": year,
            "source_url": source.get("url", "unknown"),
            "authority": source.get("authority", "unknown"),
            "source_law": source.get("law", "unknown"),
            "source_confidence": source.get("confidence", "medium"),
            "articles": json.dumps(source.get("articles", [])),
            "fetched_at": source.get("fetched_at", "2026-04-16"),
            "text": text,
            # Champ "article" pour compatibilité avec les autres chunks swiss_law
            "article": f"Barème {canton} {entity} {year}",
        }

        # Upsert
        try:
            upsert_point(point_id, vector, payload)
            print(f"  Upsert Qdrant ✓ (ID {point_id})")
            ingested += 1
        except Exception as e:
            print(f"  [ERROR] Upsert : {e}")
            errors.append(f"{yaml_file.name} (upsert)")
            continue

        # Pause courte pour éviter saturation embedder
        time.sleep(0.5)

    # Résumé
    print(f"\n{'='*60}")
    print(f"[ingest] Ingérés : {ingested}/{len(yaml_files)}")

    if not args.dry_run:
        count_after = get_collection_count()
        print(f"[ingest] Points Qdrant : {count_before} → {count_after} (+{count_after - count_before})")

    if errors:
        print(f"[ingest] ERREURS ({len(errors)}) : {errors}")
        sys.exit(1)
    else:
        print(f"[ingest] DONE ✓")


if __name__ == "__main__":
    main()
