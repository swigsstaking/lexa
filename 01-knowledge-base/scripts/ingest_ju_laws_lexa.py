#!/usr/bin/env python3
"""
Lexa — Ingestion Canton Jura : LI JU + Décret adaptation via RSJU PDF (session 25).

Source : https://rsju.jura.ch/fr/viewdocument.html?idn=20113&id={doc_id}&download=1
Format : PDF téléchargeable (le site RSJU utilise IceCube2 CMS — pas d'API HTML directe).

Extraction : pdfminer.six installé dans /tmp/lexa-venv.
Le script télécharge le PDF, l'extrait en texte via pdfminer, puis découpe en chunks
article par article (pattern "Art. N" dans le texte).

Lois ingérées :
- LI-JU (641.11) : Loi d'impôt du canton du Jura — 120 pages PDF, ~200+ articles

Additif pur : UUID4, upsert REST Qdrant. Pas de delete_collection.
Cible : ≥150 chunks JU, swiss_law → ~7530+ points.
"""

import sys
import os
import uuid
import re
import json
import time
import tempfile
from urllib.request import urlopen, Request

# Ajouter le venv pdfminer
sys.path.insert(0, "/tmp/lexa-venv/lib/python3.12/site-packages")

try:
    import requests as req_lib
    USE_REQUESTS = True
except ImportError:
    USE_REQUESTS = False

QDRANT_URL = "http://localhost:6333"
COLLECTION = "swiss_law"
BATCH_SIZE = 4
EMBEDDER_URL = "http://localhost:8082"

LAWS = [
    {
        "slug": "li_ju",
        "law": "LI-JU",
        "label": "Loi d'impôt (LI; RSJU 641.11)",
        "rs": "RSJU 641.11",
        "pdf_url": "https://rsju.jura.ch/fr/viewdocument.html?idn=20113&id=37000&download=1",
    },
]

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


def http_get_json(url: str, timeout: int = 30) -> dict:
    if USE_REQUESTS:
        r = req_lib.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    else:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))


def http_get_binary(url: str, timeout: int = 60) -> bytes:
    if USE_REQUESTS:
        r = req_lib.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
        r.raise_for_status()
        return r.content
    else:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=timeout) as resp:
            return resp.read()


def http_post_json(url: str, payload: dict, timeout: int = 120) -> dict:
    if USE_REQUESTS:
        r = req_lib.post(url, json=payload, timeout=timeout)
        r.raise_for_status()
        return r.json()
    else:
        body = json.dumps(payload).encode("utf-8")
        req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))


def embed_texts(texts: list) -> list:
    data = http_post_json(f"{EMBEDDER_URL}/v1/embeddings", {"input": texts}, timeout=120)
    return [item["embedding"] for item in data["data"]]


def qdrant_get_count() -> int:
    data = http_get_json(f"{QDRANT_URL}/collections/{COLLECTION}", timeout=10)
    return data["result"]["points_count"]


def qdrant_upsert(points: list) -> None:
    url = f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true"
    if USE_REQUESTS:
        r = req_lib.put(url, json={"points": points}, timeout=30)
        r.raise_for_status()
    else:
        body = json.dumps({"points": points}).encode("utf-8")
        req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="PUT")
        with urlopen(req, timeout=30) as resp:
            resp.read()


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extrait le texte d'un PDF via pdfminer.six."""
    try:
        from pdfminer.high_level import extract_text_to_fp
        from pdfminer.layout import LAParams
        import io
        output = io.StringIO()
        extract_text_to_fp(
            io.BytesIO(pdf_bytes),
            output,
            laparams=LAParams(line_margin=0.5, word_margin=0.1),
            output_type='text',
            codec='utf-8'
        )
        return output.getvalue()
    except Exception as e:
        print(f"[ingest-ju] ERREUR pdfminer: {e}")
        # Fallback via extract_text
        try:
            from pdfminer.high_level import extract_text
            import io
            return extract_text(io.BytesIO(pdf_bytes))
        except Exception as e2:
            print(f"[ingest-ju] ERREUR fallback pdfminer: {e2}")
            return ""


def parse_articles_ju(text: str, law_tag: str, rs: str) -> list:
    """
    Parse le texte extrait d'un PDF de loi jurassienne.

    Pattern : "Art. N [Titre optionnel]\n  texte de l'article..."
    Les alinéas sont numérotés (1), (2), (3)...

    Retourne une liste de dicts {article_num, heading, body}.
    """
    articles = []

    # Nettoyer le texte
    text = re.sub(r'\s+', ' ', text)
    text = text.replace('\x00', '')

    # Découper par article : pattern "Art. N" au début d'un segment
    # Support pour les numéros composés : Art. 1, Art. 1a, Art. 10bis, etc.
    article_pattern = re.compile(
        r'Art\.?\s+(\d+[a-z]?(?:\s*(?:bis|ter|quater))?)\s*([A-ZÁÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][^.]{0,80}?)\s*(?=\d+\s+[A-Z]|Art\.?\s+\d|$)',
        re.UNICODE
    )

    # Approche alternative : split sur "Art. N"
    parts = re.split(r'(?=Art\.\s+\d+[a-z]?\s)', text)

    for part in parts:
        part = part.strip()
        if not part or len(part) < 40:
            continue

        # Extraire le numéro d'article
        art_match = re.match(r'Art\.\s+(\d+[a-z]?(?:\s*(?:bis|ter|quater))?)\s*(.*)', part, re.DOTALL)
        if not art_match:
            continue

        art_num = f"Art. {art_match.group(1).strip()}"
        rest = art_match.group(2).strip()

        # Extraire le titre éventuel (première ligne avant les alinéas)
        heading = ""
        lines = rest.split('\n') if '\n' in rest else [rest]
        # En PDF texte extrait, chercher les majuscules initiales comme titre
        first_line = lines[0].strip() if lines else ""
        if first_line and len(first_line) < 100 and not re.match(r'^\d', first_line):
            heading = first_line[:80]
            body = ' '.join(lines[1:]).strip() if len(lines) > 1 else rest
        else:
            body = rest

        # Nettoyer le corps
        body = re.sub(r'\s+', ' ', body).strip()

        if len(body) < 20:
            body = re.sub(r'\s+', ' ', rest).strip()

        if len(body) < 20:
            continue

        articles.append({
            "article_num": art_num,
            "heading": heading,
            "body": body[:1200],
        })

    return articles


def make_point(article: dict, law: str, rs: str) -> dict:
    heading = article.get("heading", "")
    article_num = article.get("article_num", "")
    body = article.get("body", "")

    label_parts = []
    if article_num:
        label_parts.append(article_num)
    if heading:
        label_parts.append(heading)
    label = " — ".join(label_parts) if label_parts else "§"

    full_text = f"{law} — {label}: {body}"
    if len(full_text) > 1500:
        full_text = full_text[:1500]

    return {
        "id": str(uuid.uuid4()),
        "vector": [],
        "payload": {
            "text": full_text,
            "law": law,
            "rs": rs,
            "article": label,
            "jurisdiction": "cantonal-JU",
            "canton": "JU",
            "topic": "loi_fiscale_ju",
            "source": "rsju.jura.ch",
            "lang": "fr",
        },
    }


def main():
    print("[ingest-ju] Démarrage ingestion Canton Jura (LI JU via PDF)")
    print(f"[ingest-ju] Mode HTTP: {'requests' if USE_REQUESTS else 'urllib'}")

    # Vérifier pdfminer
    try:
        from pdfminer.high_level import extract_text
        print("[ingest-ju] pdfminer.six OK")
    except ImportError:
        print("[ingest-ju] ERREUR: pdfminer.six non disponible")
        print("[ingest-ju] Installer: python3 -m venv /tmp/lexa-venv && /tmp/lexa-venv/bin/pip install pdfminer.six")
        sys.exit(1)

    try:
        start_count = qdrant_get_count()
        print(f"[ingest-ju] Qdrant '{COLLECTION}' : {start_count} points au départ")
    except Exception as e:
        print(f"[ingest-ju] ERREUR Qdrant: {e}")
        sys.exit(1)

    try:
        models = http_get_json(f"{EMBEDDER_URL}/v1/models", timeout=10)
        model_id = models.get("data", [{}])[0].get("id", "unknown")
        print(f"[ingest-ju] Embedder OK: {model_id}")
    except Exception as e:
        print(f"[ingest-ju] ERREUR embedder: {e}")
        sys.exit(1)

    total_points = 0

    for law_info in LAWS:
        law_tag = law_info["law"]
        rs = law_info["rs"]
        pdf_url = law_info["pdf_url"]

        print(f"\n[ingest-ju] === {law_tag} ({rs}) ===")
        print(f"[ingest-ju] Téléchargement PDF : {pdf_url}")

        try:
            pdf_bytes = http_get_binary(pdf_url, timeout=60)
            print(f"[ingest-ju] PDF téléchargé : {len(pdf_bytes)} bytes")
        except Exception as e:
            print(f"[ingest-ju] ERREUR téléchargement PDF: {e}")
            continue

        # Extraire texte
        print(f"[ingest-ju] Extraction texte PDF...")
        text = extract_text_from_pdf(pdf_bytes)
        if not text or len(text) < 500:
            print(f"[ingest-ju] ERREUR: texte extrait trop court ({len(text) if text else 0} chars)")
            continue

        print(f"[ingest-ju] Texte extrait : {len(text)} chars")

        # Parser les articles
        articles = parse_articles_ju(text, law_tag, rs)
        print(f"[ingest-ju] {law_tag} : {len(articles)} articles extraits")

        if not articles:
            print(f"[ingest-ju] {law_tag} : 0 articles — problème de parsing PDF")
            continue

        points_raw = [make_point(art, law_tag, rs) for art in articles]
        print(f"[ingest-ju] {law_tag} : embedding {len(points_raw)} points...")

        inserted = 0
        for i in range(0, len(points_raw), BATCH_SIZE):
            batch = points_raw[i:i + BATCH_SIZE]
            texts = [p["payload"]["text"] for p in batch]

            try:
                embeddings = embed_texts(texts)
            except Exception as e:
                print(f"[ingest-ju] ERREUR embedding batch {i}: {e}")
                time.sleep(2)
                continue

            for p, vec in zip(batch, embeddings):
                p["vector"] = vec

            try:
                qdrant_upsert(batch)
                inserted += len(batch)
            except Exception as e:
                print(f"[ingest-ju] ERREUR upsert batch {i}: {e}")
                continue

            if (i // BATCH_SIZE + 1) % 10 == 0 or inserted == len(points_raw):
                print(f"  [{law_tag}] {inserted}/{len(points_raw)} points upsertés...")

        print(f"[ingest-ju] {law_tag} : {inserted} points ingérés ✓")
        total_points += inserted

    try:
        end_count = qdrant_get_count()
    except Exception:
        end_count = start_count + total_points

    print(f"\n[ingest-ju] ===== TERMINÉ =====")
    print(f"[ingest-ju] Points avant : {start_count}")
    print(f"[ingest-ju] Points après : {end_count}")
    print(f"[ingest-ju] Delta : +{end_count - start_count}")
    print(f"[ingest-ju] Total JU insérés : {total_points}")


if __name__ == "__main__":
    main()
