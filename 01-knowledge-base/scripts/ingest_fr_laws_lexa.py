#!/usr/bin/env python3
"""
Lexa — Ingestion Canton Fribourg : LICD + LIC + ORD-FP via bdlf.fr.ch (session 21).

Source : https://bdlf.fr.ch/api/fr/texts_of_law/{systematic_number}/show_as_json
Format : JSON avec json_content.document.content contenant des nœuds hiérarchiques.

Dépendances : requests (disponible sur serveur .59), stdlib uniquement.
Appels REST directs à Qdrant + llama-server embedder (pas de qdrant-client ni FlagEmbedding).

Lois ingérées :
- LICD (631.1) : Loi sur les impôts cantonaux directs — ~1098 nœuds
- LIC (632.1)  : Loi sur les impôts communaux — ~121 nœuds
- ORD-FP (631.411) : Ordonnance DFIN frais pro salariés — ~40 nœuds

Additif pur : UUID4, upsert, jurisdiction:cantonal-FR.
Cible : ~200+ chunks FR, swiss_law 6142 → ~6350+ points.
"""

import sys
import uuid
import re
import json
import time
import html as html_mod
from urllib.request import urlopen, Request
from urllib.error import URLError

try:
    import requests as req_lib
    USE_REQUESTS = True
except ImportError:
    USE_REQUESTS = False
    from urllib.request import urlopen, Request

QDRANT_URL = "http://192.168.110.103:6333"
COLLECTION = "swiss_law"
BATCH_SIZE = 4  # Batches plus petits pour le llama-server
BASE_URL = "https://bdlf.fr.ch/api/fr"
EMBEDDER_URL = "http://192.168.110.103:8082"

LAWS = [
    {
        "slug": "licd_fr",
        "law": "LICD-FR",
        "label": "Loi sur les impôts cantonaux directs (LICD; BDLF 631.1)",
        "rs": "BDLF 631.1",
        "systematic_number": "631.1",
    },
    {
        "slug": "lic_fr",
        "law": "LIC-FR",
        "label": "Loi sur les impôts communaux (LIC; BDLF 632.1)",
        "rs": "BDLF 632.1",
        "systematic_number": "632.1",
    },
    {
        "slug": "ord_fp_fr",
        "law": "ORD-FP-FR",
        "label": "Ordonnance DFIN sur déduction frais professionnels (BDLF 631.411)",
        "rs": "BDLF 631.411",
        "systematic_number": "631.411",
    },
]

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


def http_get(url: str, timeout: int = 30) -> dict:
    """GET JSON via requests ou urllib."""
    if USE_REQUESTS:
        r = req_lib.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    else:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))


def http_post_json(url: str, payload: dict, timeout: int = 120) -> dict:
    """POST JSON via requests ou urllib."""
    body = json.dumps(payload).encode("utf-8")
    if USE_REQUESTS:
        r = req_lib.post(url, json=payload, timeout=timeout)
        r.raise_for_status()
        return r.json()
    else:
        req = Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
            method="POST",
        )
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))


def embed_texts(texts: list) -> list:
    """Appelle le llama-server BGE-M3 GGUF via l'API OpenAI-compatible."""
    data = http_post_json(f"{EMBEDDER_URL}/v1/embeddings", {"input": texts}, timeout=120)
    return [item["embedding"] for item in data["data"]]


def qdrant_get_count() -> int:
    """Retourne le nombre de points dans la collection."""
    data = http_get(f"{QDRANT_URL}/collections/{COLLECTION}", timeout=10)
    return data["result"]["points_count"]


def qdrant_upsert(points: list) -> None:
    """Upsert des points dans Qdrant via REST (PUT)."""
    body = {"points": points}
    url = f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true"
    body_bytes = json.dumps(body).encode("utf-8")
    if USE_REQUESTS:
        r = req_lib.put(url, json=body, timeout=30)
        r.raise_for_status()
    else:
        req = Request(url, data=body_bytes,
                      headers={"Content-Type": "application/json"},
                      method="PUT")
        with urlopen(req, timeout=30) as resp:
            resp.read()


def strip_html_tags(html_str: str) -> str:
    """Supprime les balises HTML et décode les entités."""
    if not html_str:
        return ""
    # Supprimer les balises
    text = re.sub(r"<[^>]+>", " ", html_str)
    # Décoder les entités HTML
    text = html_mod.unescape(text)
    # Normaliser les espaces
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_title_from_html(html_str: str) -> str:
    """Extrait le titre d'un fragment HTML d'article bdlf."""
    if not html_str:
        return ""
    # Chercher class="article_title" ou class="title_text"
    m = re.search(r"class=['\"](?:article_title|title_text|heading)['\"][^>]*>([^<]+)<", html_str)
    if m:
        return m.group(1).strip()
    # Fallback: chercher <span class='title_text'>
    m2 = re.search(r"title_text['\"]>([^<]+)<", html_str)
    if m2:
        return m2.group(1).strip()
    return ""


def extract_articles(node: dict, law_tag: str, rs: str) -> list:
    """Parcourt récursivement les nœuds JSON bdlf et collecte les articles."""
    articles = []

    node_type = node.get("type", "")
    html_content = node.get("html_content", {})

    # HTML français
    if isinstance(html_content, dict):
        html_fr = html_content.get("fr", "")
    elif isinstance(html_content, str):
        html_fr = html_content
    else:
        html_fr = ""

    # Texte brut français
    text_dict = node.get("text", {})
    if isinstance(text_dict, dict):
        text_fr = text_dict.get("fr", "")
    elif isinstance(text_dict, str):
        text_fr = text_dict
    else:
        text_fr = ""

    # Numéro
    number = node.get("number", {})
    if isinstance(number, dict):
        num_str = number.get("fr", number.get("de", ""))
    else:
        num_str = str(number) if number else ""

    # Collecter les articles avec contenu
    if node_type in ["article", "paragraph"] and html_fr:
        body_text = text_fr if text_fr else strip_html_tags(html_fr)
        if len(body_text) > 30:
            title = extract_title_from_html(html_fr)
            articles.append({
                "article_num": num_str,
                "heading": title,
                "body": body_text,
                "law": law_tag,
                "rs": rs,
            })

    # Récursion sur les enfants
    for child in node.get("children", []):
        articles.extend(extract_articles(child, law_tag, rs))

    return articles


def make_point(article: dict, law: str, rs: str, slug: str) -> dict:
    """Crée un dict Qdrant point depuis un article."""
    body = article["body"]
    heading = article["heading"]
    article_num = article["article_num"]

    label_parts = []
    if article_num:
        label_parts.append(f"Art. {article_num}")
    if heading:
        label_parts.append(heading)
    label = " — ".join(label_parts) if label_parts else f"§{slug}"

    full_text = f"{law} — {label}: {body}"
    if len(full_text) > 1500:
        full_text = full_text[:1500]

    return {
        "id": str(uuid.uuid4()),
        "vector": [],  # sera rempli
        "payload": {
            "text": full_text,
            "law": law,
            "rs": rs,
            "article": label,
            "jurisdiction": "cantonal-FR",
            "canton": "FR",
            "topic": "loi_fiscale_fr",
            "source": "bdlf.fr.ch",
            "lang": "fr",
        },
    }


def main():
    print("[ingest-fr] Démarrage ingestion Canton Fribourg (LICD + LIC + ORD-FP)")
    print(f"[ingest-fr] Mode HTTP: {'requests' if USE_REQUESTS else 'urllib'}")

    # Vérifier Qdrant
    try:
        start_count = qdrant_get_count()
        print(f"[ingest-fr] Qdrant '{COLLECTION}' : {start_count} points au départ")
    except Exception as e:
        print(f"[ingest-fr] ERREUR Qdrant: {e}")
        sys.exit(1)

    # Vérifier embedder
    try:
        models = http_get(f"{EMBEDDER_URL}/v1/models", timeout=10)
        model_id = models.get("data", [{}])[0].get("id", "unknown")
        print(f"[ingest-fr] Embedder OK: {model_id}")
    except Exception as e:
        print(f"[ingest-fr] ERREUR embedder: {e}")
        sys.exit(1)

    total_points = 0

    for law_info in LAWS:
        slug = law_info["slug"]
        law_tag = law_info["law"]
        label = law_info["label"]
        rs = law_info["rs"]
        sn = law_info["systematic_number"]

        print(f"\n[ingest-fr] === {law_tag} ({sn}) ===")

        try:
            law_data = http_get(f"{BASE_URL}/texts_of_law/{sn}/show_as_json")["text_of_law"]
        except Exception as e:
            print(f"[ingest-fr] ERREUR fetch {sn}: {e}")
            continue

        if law_data.get("abrogated"):
            print(f"[ingest-fr] {law_tag} abrogée — skip")
            continue

        sv = law_data.get("selected_version", {})
        jc = sv.get("json_content", {})
        doc = jc.get("document", {})
        content = doc.get("content", {})

        if not content:
            print(f"[ingest-fr] {law_tag} : pas de contenu JSON — skip")
            continue

        articles = extract_articles(content, law_tag, rs)
        print(f"[ingest-fr] {law_tag} : {len(articles)} articles extraits")

        if not articles:
            print(f"[ingest-fr] {law_tag} : 0 articles — skip")
            continue

        # Créer les points
        points_raw = [make_point(art, law_tag, rs, slug) for art in articles]
        print(f"[ingest-fr] {law_tag} : embedding {len(points_raw)} points…")

        inserted = 0
        for i in range(0, len(points_raw), BATCH_SIZE):
            batch = points_raw[i:i + BATCH_SIZE]
            texts = [p["payload"]["text"] for p in batch]

            try:
                embeddings = embed_texts(texts)
            except Exception as e:
                print(f"[ingest-fr] ERREUR embedding batch {i}: {e}")
                time.sleep(2)
                continue

            for p, vec in zip(batch, embeddings):
                p["vector"] = vec

            try:
                qdrant_upsert(batch)
                inserted += len(batch)
            except Exception as e:
                print(f"[ingest-fr] ERREUR upsert batch {i}: {e}")
                continue

            if (i // BATCH_SIZE + 1) % 10 == 0 or inserted == len(points_raw):
                print(f"  [{law_tag}] {inserted}/{len(points_raw)} points upsertés…")

        print(f"[ingest-fr] {law_tag} : {inserted} points ingérés ✓")
        total_points += inserted

    # Stats finales
    try:
        end_count = qdrant_get_count()
    except Exception:
        end_count = start_count + total_points

    print(f"\n[ingest-fr] ===== TERMINÉ =====")
    print(f"[ingest-fr] Points avant : {start_count}")
    print(f"[ingest-fr] Points après : {end_count}")
    print(f"[ingest-fr] Delta : +{end_count - start_count}")
    print(f"[ingest-fr] Total FR insérés : {total_points}")


if __name__ == "__main__":
    main()
