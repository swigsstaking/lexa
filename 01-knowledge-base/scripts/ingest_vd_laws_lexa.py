#!/usr/bin/env python3
"""
Lexa — Ingestion Canton Vaud : LI + LIPC + RLI via Base Législative Vaudoise (session 18).

Source : https://prestations.vd.ch/pub/blv-publication/api/actes/{html_id}/html
Format : XHTML AkomaNtoso (UTF-8), servi par l'API JSON de la BLV.
La SPA Angular BLV expose une API REST :
  1. GET api/actes/CONSOLIDE?id={acte_id}&cote={cote} → liste des versions, on prend la version ACTUELLE
  2. GET api/actes/{html_id}/html → XHTML de la loi courante

Structure HTML : class="akn-article-container" contient le numéro/titre de chaque article.
Les alinéas suivent dans des div.collapse adjacents avec class="akn-alinea".

Additif pur : UUID4, upsert, jurisdiction:cantonal-VD. Ne fait JAMAIS de delete_collection.
Première ingestion VD → les chunks existants VS/GE/LIFD/LTVA restent intacts.

Cible : ~400 articles (LI 327 + LIPC 71 + RLI 9), collection swiss_law de 5761 → ~6160 points.
"""

import sys
import uuid
import re
import json
from urllib.request import urlopen, Request

sys.path.insert(0, "/home/swigs/.local/lib/python3.12/site-packages")

from bs4 import BeautifulSoup
from FlagEmbedding import BGEM3FlagModel
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION = "swiss_law"
BATCH_SIZE = 8
BASE_URL = "https://prestations.vd.ch/pub/blv-publication/api"

# Lois cibles Vaud
# acte_id = ID stable de l'acte dans la BLV (pour récupérer la version ACTUELLE)
# html_id  = ID de la version HTML actuelle (hardcodé pour robustesse, re-fetchable via acte_id)
LAWS = [
    {
        "slug": "li_vd",
        "law": "LI-VD",
        "label": "Loi sur les impôts directs cantonaux (LI; BLV 642.11)",
        "rs": "BLV 642.11",
        "cote": "642.11",
        "acte_id": "8df99d51-8df8-49ed-9ef5-2fa4817d0004",
        "html_id": "a28b9d22-658e-4236-b5b1-95eccc04d2b1",  # version 2026
    },
    {
        "slug": "lipc_vd",
        "law": "LIPC-VD",
        "label": "Loi sur les impôts communaux (LIPC; BLV 650.11)",
        "rs": "BLV 650.11",
        "cote": "650.11",
        "acte_id": "66dcd6f6-b573-4422-a30f-b0d0845151cf",
        "html_id": "0848120c-c688-409b-9bf7-fe174efd0bfc",  # version 2026
    },
    {
        "slug": "rli_vd",
        "law": "RLI-VD",
        "label": "Règlement d'application de la LI (RLI; BLV 642.11.1)",
        "rs": "BLV 642.11.1",
        "cote": "642.11.1",
        "acte_id": "5390e38d-2c99-4168-8778-9828e56c0009",
        "html_id": "afe66749-8119-4719-9912-b86b21f4a944",  # version 2026
    },
]

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


def get_current_html_id(law_info: dict) -> str:
    """
    Récupère le html_id de la version ACTUELLE depuis l'API BLV.
    Fallback sur le html_id hardcodé si l'API échoue.
    """
    acte_id = law_info["acte_id"]
    cote = law_info["cote"]
    url = f"{BASE_URL}/actes/CONSOLIDE?id={acte_id}&cote={cote}"
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if isinstance(data, list):
            for item in data:
                if item.get("versionType") == "ACTUELLE":
                    return item["htmlId"]
    except Exception as e:
        print(f"  [WARN] CONSOLIDE API failed ({e}), using hardcoded html_id")
    return law_info["html_id"]


def fetch_law_html(html_id: str) -> str:
    """Fetch le XHTML AkomaNtoso depuis l'API BLV, retourne le HTML UTF-8 décodé."""
    url = f"{BASE_URL}/actes/{html_id}/html"
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as resp:
        raw = resp.read()
    return raw.decode("utf-8")


def clean_heading(heading: str) -> str:
    """Nettoie les notes de bas de page et espaces superflus dans les titres."""
    # Supprimer les références de notes [1, 2, 3] ou [26, 34, 36]
    heading = re.sub(r"\[\d+(?:,\s*\d+)*\]", "", heading)
    # Nettoyer les astérisques de modification
    heading = re.sub(r"^\*+\s*", "", heading).strip()
    return heading


def parse_articles(html_text: str, law_tag: str):
    """
    Parse les articles depuis le XHTML AkomaNtoso de la BLV.

    Structure :
      <div class="akn-article-container">
        <table class="akn-article">
          <td class="akn-num">Art. N</td>
          <td class="akn-heading-container">
            <div class="akn-heading">Titre de l'article</div>
          </td>
        </table>
      </div>
      <!-- sibling divs with class="collapse" contenant les alinéas -->
      <div class="collapse show">
        <div class="akn-alinea ...">1 Texte de l'alinéa 1 ...</div>
        <div class="akn-alinea ...">2 Texte de l'alinéa 2 ...</div>
      </div>
    """
    soup = BeautifulSoup(html_text, "html.parser")
    article_containers = soup.find_all(class_="akn-article-container")

    articles = []
    for art_div in article_containers:
        # Extraire numéro
        num_el = art_div.find(class_="akn-num")
        if not num_el:
            continue
        num_text = num_el.get_text(strip=True)
        # Extraire N depuis "Art. N" ou "Art. Na"
        m = re.match(r"Art\.\s*(\d+[a-z]?)", num_text)
        if not m:
            continue
        article_num = m.group(1)

        # Extraire titre (heading)
        head_el = art_div.find(class_="akn-heading")
        heading = clean_heading(head_el.get_text(strip=True) if head_el else "")

        # Collecter le corps depuis les éléments siblings jusqu'au prochain akn-article-container
        body_parts = []
        sib = art_div.find_next_sibling()
        while sib:
            # Arrêt si on rencontre un nouvel article
            if sib.get("class") and "akn-article-container" in sib.get("class", []):
                break
            # Collecter les alinéas dans ce sibling
            alineas = sib.find_all(class_="akn-alinea")
            for al in alineas:
                t = al.get_text(separator=" ", strip=True)
                if t:
                    body_parts.append(t)
            sib = sib.find_next_sibling()

        body = " ".join(body_parts).strip()

        articles.append({
            "article_num": article_num,
            "heading": heading,
            "body": body,
        })

    # Déduplication : garder la version avec le body le plus long
    seen = {}
    for art in articles:
        key = art["article_num"]
        if key not in seen or len(art["body"]) > len(seen[key]["body"]):
            seen[key] = art

    # Filtrer les articles avec body trop court (probablement table des matières)
    filtered = [a for a in seen.values() if len(a["body"]) > 20]
    return filtered


def build_chunks(articles, law_info):
    payloads = []
    for art in articles:
        full_text = f"[{law_info['label']}] "
        full_text += f"Art. {art['article_num']}"
        if art["heading"]:
            full_text += f" - {art['heading']}"
        if art["body"]:
            full_text += f"\n{art['body']}"

        payloads.append({
            "text": full_text,
            "law": law_info["law"],
            "law_label": law_info["label"],
            "article": f"Art. {art['article_num']}",
            "article_num": art["article_num"],
            "heading": art["heading"][:120],
            "rs": law_info["rs"],
            "topic": "loi_fiscale_vd",
            "date_version": "2026-01-01",
            "source": "prestations.vd.ch",
            "category": "loi-cantonale",
            "jurisdiction": "cantonal-VD",
            "canton": "VD",
            "url": f"https://prestations.vd.ch/pub/blv-publication/actes/consolide/{law_info['cote']}",
        })
    return payloads


def main():
    print("=" * 60)
    print("LEXA - Ingestion lois fiscales VD (LI + LIPC + RLI)")
    print("Source : Base Législative Vaudoise (BLV) API AkomaNtoso")
    print("=" * 60)

    all_chunks = []
    per_law_counts = {}

    for law_info in LAWS:
        print(f"\n[CONSOLIDE] Résolution html_id pour {law_info['law']} ({law_info['cote']})")
        html_id = get_current_html_id(law_info)
        print(f"  html_id = {html_id}")

        print(f"[FETCH] {law_info['law']} — api/actes/{html_id}/html")
        html_text = fetch_law_html(html_id)
        print(f"  HTML size: {len(html_text):,} chars (UTF-8)")

        print(f"[PARSE] {law_info['law']}")
        articles = parse_articles(html_text, law_info["law"])
        print(f"  {len(articles)} articles uniques après dedup + filter")
        if articles:
            print(f"  Premier: Art. {articles[0]['article_num']} — {articles[0]['heading'][:60]}")
            print(f"  Dernier: Art. {articles[-1]['article_num']} — {articles[-1]['heading'][:60]}")

        chunks = build_chunks(articles, law_info)
        per_law_counts[law_info["law"]] = len(chunks)
        all_chunks.extend(chunks)

    print("\n" + "=" * 60)
    print(f"Total chunks à upserter : {len(all_chunks)}")
    for law, count in per_law_counts.items():
        print(f"  {law}: {count}")
    print("=" * 60)

    if not all_chunks:
        print("\nERROR: no chunks produced, aborting")
        return

    print("\n[QDRANT] Connecting...")
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    before = client.get_collection(COLLECTION).points_count
    print(f"  Collection swiss_law avant: {before} points")

    print("\n[BGE-M3] Loading model...")
    model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True, device="cuda")

    print(f"\n[UPSERT] Encoding and upserting {len(all_chunks)} chunks...")
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i : i + BATCH_SIZE]
        texts = [c["text"] for c in batch]
        vecs = model.encode(
            texts,
            batch_size=BATCH_SIZE,
            max_length=512,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )["dense_vecs"]
        points = [
            PointStruct(id=str(uuid.uuid4()), vector=v.tolist(), payload=c)
            for c, v in zip(batch, vecs)
        ]
        client.upsert(collection_name=COLLECTION, points=points)
        if (i // BATCH_SIZE) % 5 == 0:
            print(f"  {i + len(batch)} / {len(all_chunks)} upserted")

    final = client.get_collection(COLLECTION).points_count
    net_added = final - before
    print(f"\n  Collection après: {final} points (net +{net_added})")

    # ── Tests RAG VD ────────────────────────────────────
    print("\n[RAG TEST] 5 queries représentatives Canton Vaud:")
    queries = [
        "Déduction frais professionnels canton Vaud salarié",
        "Impôt sur la fortune personne physique Vaud",
        "Assujettissement rattachement personnel canton Vaud",
        "Impôt cantonal et communal Lausanne",
        "Coefficient communal impôt direct Vaud",
    ]
    for q in queries:
        v = model.encode(
            [q], return_dense=True, return_sparse=False,
            return_colbert_vecs=False,
        )["dense_vecs"][0].tolist()
        results = client.query_points(
            collection_name=COLLECTION, query=v, limit=3, with_payload=True,
        ).points
        print(f"\n  Q: {q}")
        for r in results:
            p = r.payload
            law = p.get("law", "")
            art = p.get("article", "")
            heading = (p.get("heading") or "")[:60]
            marker = "[VD]" if p.get("jurisdiction") == "cantonal-VD" else "    "
            print(f"    {marker} [{r.score:.3f}] {law} {art} — {heading}")

    print("\n" + "=" * 60)
    print(f"DONE — Collection: {final} points, VD net +{net_added}")
    print(f"  Per law: {per_law_counts}")
    print("=" * 60)


if __name__ == "__main__":
    main()
