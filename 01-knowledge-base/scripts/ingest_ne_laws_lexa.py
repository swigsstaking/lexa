#!/usr/bin/env python3
"""
Lexa — Ingestion Canton Neuchâtel : LCdir + RGI + ORD-FP via RSN (session 25).

Source : https://rsn.ne.ch/DATA/program/books/rsne/htm/{num}.htm (HTML statique,
encoding windows-1252). Fichiers HTML publics servis par le RSN (Recueil
systématique neuchâtelois — serveur Microsoft IIS ASP.NET).

Lois ingérées :
- LCdir-NE (631.0)  : Loi sur les contributions directes — ~346 articles
- RGI-NE (631.00)   : Règlement général sur l'imposition — ~50 articles
- RLE-NE (631.01)   : Règlement sur les listes d'échéances — articles divers

Même pattern d'ingestion que GE (session 16) et NE utilise le même format
HTML Word legacy (windows-1252, balises <p class=xNormal>, <a name="LVMPART_X">).

Additif pur : UUID4, upsert REST Qdrant. Pas de delete_collection.
Cible : ~200+ chunks NE, swiss_law 7178 → ~7380+ points.
"""

import sys
import uuid
import re
import html as html_mod
import json
import time
from urllib.request import urlopen, Request

try:
    import requests as req_lib
    USE_REQUESTS = True
except ImportError:
    USE_REQUESTS = False

QDRANT_URL = "http://localhost:6333"
COLLECTION = "swiss_law"
BATCH_SIZE = 4
EMBEDDER_URL = "http://localhost:8082"
BASE_URL = "https://rsn.ne.ch/DATA/program/books/rsne/htm"

LAWS = [
    {
        "slug": "lcdir_ne",
        "law": "LCdir-NE",
        "label": "Loi sur les contributions directes (LCdir; RSN 631.0)",
        "rs": "RSN 631.0",
        "htm": "631.0.htm",
    },
    {
        "slug": "rgi_ne",
        "law": "RGI-NE",
        "label": "Règlement général sur l'imposition (RGI; RSN 631.00)",
        "rs": "RSN 631.00",
        "htm": "631.00.htm",
    },
    {
        "slug": "rle_ne",
        "law": "ORD-FP-NE",
        "label": "Ordonnance sur les listes d'échéances (RSN 631.01)",
        "rs": "RSN 631.01",
        "htm": "631.01.htm",
    },
]

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


def http_get_json(url: str, timeout: int = 30) -> dict:
    """GET JSON via requests ou urllib."""
    if USE_REQUESTS:
        r = req_lib.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    else:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))


def http_get_html(url: str, timeout: int = 30) -> str:
    """GET HTML windows-1252 (format RSN NE / SIL legacy)."""
    if USE_REQUESTS:
        r = req_lib.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
        r.raise_for_status()
        raw = r.content
    else:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    try:
        return raw.decode("windows-1252")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace")


def http_post_json(url: str, payload: dict, timeout: int = 120) -> dict:
    """POST JSON."""
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


def strip_html(text: str) -> str:
    """Supprime balises HTML, décode entités, normalise espaces."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_mod.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_articles_ne(html_content: str, law_tag: str, rs: str) -> list:
    """
    Parse les articles HTML RSN NE (format Word legacy windows-1252).

    Structure typique :
      <a name="LVMPART_X"><b><span lang=FR-CH>Art. N [Titre éventuel]</span></b></a>
      <span lang=FR-CH>texte de l'article...</span>

    Retourne une liste de dicts {article_num, heading, body}.
    """
    articles = []

    # Pattern : <a name="LVMPART_..." ...>...Art. NUMBER...</a> suivi du texte
    # On découpe le HTML en blocs par article
    # Trouver tous les ancres LVMPART
    anchors = list(re.finditer(r'<a\s+name="LVMPART_\d+"', html_content, re.IGNORECASE))

    for i, match in enumerate(anchors):
        start = match.start()
        end = anchors[i + 1].start() if i + 1 < len(anchors) else len(html_content)
        block = html_content[start:end]

        # Extraire le numéro d'article
        art_match = re.search(r"Art\.\s*(\d+[a-z]?(?:\s*bis|ter|quater)?)", block, re.IGNORECASE)
        if not art_match:
            continue
        article_num = art_match.group(0).strip()

        # Extraire le titre (texte en gras après le numéro, avant le texte normal)
        heading = ""
        heading_match = re.search(
            r"Art\.\s*\d+[a-z]?[^<]*</span></b></a>([^<]{3,80})",
            block,
            re.IGNORECASE,
        )
        if heading_match:
            heading = heading_match.group(1).strip()
            heading = re.sub(r"\s+", " ", heading).strip()

        # Corps : tout le texte du bloc après strip HTML
        body = strip_html(block)

        # Nettoyer le corps
        body = re.sub(r"\s+", " ", body).strip()

        if len(body) < 30:
            continue

        articles.append({
            "article_num": article_num,
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
            "jurisdiction": "cantonal-NE",
            "canton": "NE",
            "topic": "loi_fiscale_ne",
            "source": "rsn.ne.ch",
            "lang": "fr",
        },
    }


def main():
    print("[ingest-ne] Démarrage ingestion Canton Neuchâtel (LCdir + RGI + ORD-FP)")
    print(f"[ingest-ne] Mode HTTP: {'requests' if USE_REQUESTS else 'urllib'}")

    try:
        start_count = qdrant_get_count()
        print(f"[ingest-ne] Qdrant '{COLLECTION}' : {start_count} points au départ")
    except Exception as e:
        print(f"[ingest-ne] ERREUR Qdrant: {e}")
        sys.exit(1)

    try:
        models = http_get_json(f"{EMBEDDER_URL}/v1/models", timeout=10)
        model_id = models.get("data", [{}])[0].get("id", "unknown")
        print(f"[ingest-ne] Embedder OK: {model_id}")
    except Exception as e:
        print(f"[ingest-ne] ERREUR embedder: {e}")
        sys.exit(1)

    total_points = 0

    for law_info in LAWS:
        law_tag = law_info["law"]
        rs = law_info["rs"]
        htm = law_info["htm"]
        url = f"{BASE_URL}/{htm}"

        print(f"\n[ingest-ne] === {law_tag} ({rs}) ===")
        print(f"[ingest-ne] URL: {url}")

        try:
            html_content = http_get_html(url, timeout=30)
        except Exception as e:
            print(f"[ingest-ne] ERREUR fetch {htm}: {e}")
            continue

        if len(html_content) < 1000:
            print(f"[ingest-ne] {law_tag} : contenu trop court ({len(html_content)} chars) — skip")
            continue

        articles = parse_articles_ne(html_content, law_tag, rs)
        print(f"[ingest-ne] {law_tag} : {len(articles)} articles extraits")

        if not articles:
            print(f"[ingest-ne] {law_tag} : 0 articles — skip")
            continue

        points_raw = [make_point(art, law_tag, rs) for art in articles]
        print(f"[ingest-ne] {law_tag} : embedding {len(points_raw)} points...")

        inserted = 0
        for i in range(0, len(points_raw), BATCH_SIZE):
            batch = points_raw[i:i + BATCH_SIZE]
            texts = [p["payload"]["text"] for p in batch]

            try:
                embeddings = embed_texts(texts)
            except Exception as e:
                print(f"[ingest-ne] ERREUR embedding batch {i}: {e}")
                time.sleep(2)
                continue

            for p, vec in zip(batch, embeddings):
                p["vector"] = vec

            try:
                qdrant_upsert(batch)
                inserted += len(batch)
            except Exception as e:
                print(f"[ingest-ne] ERREUR upsert batch {i}: {e}")
                continue

            if (i // BATCH_SIZE + 1) % 10 == 0 or inserted == len(points_raw):
                print(f"  [{law_tag}] {inserted}/{len(points_raw)} points upsertés...")

        print(f"[ingest-ne] {law_tag} : {inserted} points ingérés ✓")
        total_points += inserted

    try:
        end_count = qdrant_get_count()
    except Exception:
        end_count = start_count + total_points

    print(f"\n[ingest-ne] ===== TERMINÉ =====")
    print(f"[ingest-ne] Points avant : {start_count}")
    print(f"[ingest-ne] Points après : {end_count}")
    print(f"[ingest-ne] Delta : +{end_count - start_count}")
    print(f"[ingest-ne] Total NE insérés : {total_points}")


if __name__ == "__main__":
    main()
