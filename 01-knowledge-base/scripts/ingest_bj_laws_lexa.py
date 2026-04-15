#!/usr/bin/env python3
"""
Lexa — Ingestion Canton Berne (version française) : LI-BE + OI-BE via belex.sites.be.ch (session 25).

Source : https://www.belex.sites.be.ch/api/fr/texts_of_law/{sn}/show_as_json
Format : JSON identique à bdlf.fr.ch — même structure LexWork (json_content.document.content).

Note DNS : belex.sites.be.ch peut être non résolvable depuis certains réseaux privés.
Fallback : utiliser l'IP directe 93.187.192.136 avec le header Host correct.

Lois ingérées :
- LI-BE (661.11)  : Loi sur les impôts (Steuergesetz) — version FR, ~327 articles
- OI-BE (661.111) : Ordonnance sur les impôts — version FR, ~50 articles (si disponible)

Perimètre : version FR uniquement (langue='fr' dans l'API) — pertinent pour le Jura bernois
et toute la partie francophone du canton de Berne.

Additif pur : UUID4, upsert REST Qdrant. Pas de delete_collection.
Cible : ≥100 chunks BE-Jura, swiss_law → ~7630+ points.
"""

import sys
import uuid
import re
import json
import time
import html as html_mod
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

# belex.sites.be.ch — même format API que bdlf.fr.ch
# IP directe en fallback si DNS échoue (résolu depuis Mac: 93.187.192.136)
BELEX_HOST = "www.belex.sites.be.ch"
BELEX_IP_FALLBACK = "93.187.192.136"

LAWS = [
    {
        "slug": "li_be",
        "law": "LI-BE",
        "label": "Loi sur les impôts (LI-BE; RSB 661.11)",
        "rs": "RSB 661.11",
        "systematic_number": "661.11",
    },
    {
        "slug": "oi_be",
        "law": "OI-BE",
        "label": "Ordonnance sur les impôts (OI-BE; RSB 661.111)",
        "rs": "RSB 661.111",
        "systematic_number": "661.111",
    },
]

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


def http_get_json_belex(systematic_number: str, timeout: int = 30) -> dict:
    """
    Fetch JSON depuis belex.sites.be.ch.
    Essaie d'abord le hostname, puis fallback sur l'IP directe.
    """
    urls_to_try = [
        f"https://{BELEX_HOST}/api/fr/texts_of_law/{systematic_number}/show_as_json",
        f"https://{BELEX_IP_FALLBACK}/api/fr/texts_of_law/{systematic_number}/show_as_json",
    ]

    last_err = None
    for url in urls_to_try:
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        # Si on utilise l'IP, ajouter le header Host
        if BELEX_IP_FALLBACK in url:
            headers["Host"] = BELEX_HOST

        try:
            if USE_REQUESTS:
                r = req_lib.get(url, headers=headers, timeout=timeout, verify=False)
                r.raise_for_status()
                return r.json()
            else:
                req = Request(url, headers=headers)
                with urlopen(req, timeout=timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            last_err = e
            print(f"[ingest-bj] Essai {url} échoué: {e}")
            continue

    raise RuntimeError(f"Impossible d'accéder à belex.sites.be.ch: {last_err}")


def http_get_json(url: str, timeout: int = 30) -> dict:
    if USE_REQUESTS:
        r = req_lib.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    else:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))


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


def strip_html_tags(html_str: str) -> str:
    if not html_str:
        return ""
    text = re.sub(r"<[^>]+>", " ", html_str)
    text = html_mod.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_title_from_html(html_str: str) -> str:
    if not html_str:
        return ""
    m = re.search(r"class=['\"](?:article_title|title_text|heading)['\"][^>]*>([^<]+)<", html_str)
    if m:
        return m.group(1).strip()
    m2 = re.search(r"title_text['\"]>([^<]+)<", html_str)
    if m2:
        return m2.group(1).strip()
    return ""


def extract_articles(node: dict, law_tag: str, rs: str) -> list:
    """
    Parcourt récursivement les nœuds JSON belex (même structure que bdlf.fr.ch).
    Retourne une liste de dicts article.
    """
    articles = []

    node_type = node.get("type", "")
    html_content = node.get("html_content", {})

    # HTML français uniquement (langue cible = FR)
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
        "vector": [],
        "payload": {
            "text": full_text,
            "law": law,
            "rs": rs,
            "article": label,
            "jurisdiction": "cantonal-BE",
            "canton": "BE",
            "topic": "loi_fiscale_bj",
            "source": "belex.sites.be.ch",
            "lang": "fr",
        },
    }


def main():
    print("[ingest-bj] Démarrage ingestion Canton Berne francophone (LI-BE + OI-BE)")
    print(f"[ingest-bj] Mode HTTP: {'requests' if USE_REQUESTS else 'urllib'}")

    # Désactiver les warnings SSL si on utilise l'IP directe
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except Exception:
        pass

    try:
        start_count = qdrant_get_count()
        print(f"[ingest-bj] Qdrant '{COLLECTION}' : {start_count} points au départ")
    except Exception as e:
        print(f"[ingest-bj] ERREUR Qdrant: {e}")
        sys.exit(1)

    try:
        models = http_get_json(f"{EMBEDDER_URL}/v1/models", timeout=10)
        model_id = models.get("data", [{}])[0].get("id", "unknown")
        print(f"[ingest-bj] Embedder OK: {model_id}")
    except Exception as e:
        print(f"[ingest-bj] ERREUR embedder: {e}")
        sys.exit(1)

    total_points = 0

    for law_info in LAWS:
        slug = law_info["slug"]
        law_tag = law_info["law"]
        label = law_info["label"]
        rs = law_info["rs"]
        sn = law_info["systematic_number"]

        print(f"\n[ingest-bj] === {law_tag} ({sn}) ===")

        try:
            law_data = http_get_json_belex(sn, timeout=30)["text_of_law"]
        except Exception as e:
            print(f"[ingest-bj] ERREUR fetch {sn}: {e}")
            continue

        if law_data.get("abrogated"):
            print(f"[ingest-bj] {law_tag} abrogée — skip")
            continue

        sv = law_data.get("selected_version", {})
        jc = sv.get("json_content", {})
        doc = jc.get("document", {})
        content = doc.get("content", {})

        if not content:
            print(f"[ingest-bj] {law_tag} : pas de contenu JSON — skip")
            continue

        articles = extract_articles(content, law_tag, rs)
        print(f"[ingest-bj] {law_tag} : {len(articles)} articles extraits")

        if not articles:
            print(f"[ingest-bj] {law_tag} : 0 articles — skip")
            continue

        points_raw = [make_point(art, law_tag, rs, slug) for art in articles]
        print(f"[ingest-bj] {law_tag} : embedding {len(points_raw)} points...")

        inserted = 0
        for i in range(0, len(points_raw), BATCH_SIZE):
            batch = points_raw[i:i + BATCH_SIZE]
            texts = [p["payload"]["text"] for p in batch]

            try:
                embeddings = embed_texts(texts)
            except Exception as e:
                print(f"[ingest-bj] ERREUR embedding batch {i}: {e}")
                time.sleep(2)
                continue

            for p, vec in zip(batch, embeddings):
                p["vector"] = vec

            try:
                qdrant_upsert(batch)
                inserted += len(batch)
            except Exception as e:
                print(f"[ingest-bj] ERREUR upsert batch {i}: {e}")
                continue

            if (i // BATCH_SIZE + 1) % 10 == 0 or inserted == len(points_raw):
                print(f"  [{law_tag}] {inserted}/{len(points_raw)} points upsertés...")

        print(f"[ingest-bj] {law_tag} : {inserted} points ingérés ✓")
        total_points += inserted

    try:
        end_count = qdrant_get_count()
    except Exception:
        end_count = start_count + total_points

    print(f"\n[ingest-bj] ===== TERMINÉ =====")
    print(f"[ingest-bj] Points avant : {start_count}")
    print(f"[ingest-bj] Points après : {end_count}")
    print(f"[ingest-bj] Delta : +{end_count - start_count}")
    print(f"[ingest-bj] Total BE-Jura insérés : {total_points}")


if __name__ == "__main__":
    main()
