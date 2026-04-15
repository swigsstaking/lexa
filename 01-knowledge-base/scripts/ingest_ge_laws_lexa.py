#!/usr/bin/env python3
"""
Lexa — Ingestion Canton Genève : LCP + LIPP + LIPM via SILGeneve (session 16).

Source : https://silgeneve.ch/legis/data/rsg_d3_XX.htm (HTML statique,
encoding windows-1252). Pas besoin de Playwright — les lois fiscales GE
sont servies en HTTP simple par le Service de législation de la
Chancellerie cantonale.

Additif pur : UUID4, upsert, jurisdiction:cantonal-GE. Ne fait JAMAIS
de delete_collection. Première ingestion GE → les chunks existants
VS/LIFD/LTVA restent intacts.

Cible : ~300-400 articles uniques, collection swiss_law de 5388 → ~5700 points.
"""

import sys
import uuid
import re
import html
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

LAWS = [
    {
        "slug": "d3_05",
        "law": "LCP-GE",
        "label": "Loi générale sur les contributions publiques (RSG D 3 05)",
        "rs": "D 3 05",
        "url": "https://silgeneve.ch/legis/data/rsg_d3_05.htm",
    },
    {
        "slug": "d3_08",
        "law": "LIPP-GE",
        "label": "Loi sur l'imposition des personnes physiques (RSG D 3 08)",
        "rs": "D 3 08",
        "url": "https://silgeneve.ch/legis/data/rsg_d3_08.htm",
    },
    {
        "slug": "d3_15",
        "law": "LIPM-GE",
        "label": "Loi sur l'imposition des personnes morales (RSG D 3 15)",
        "rs": "D 3 15",
        "url": "https://silgeneve.ch/legis/data/rsg_d3_15.htm",
    },
]

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


def fetch_law(url: str) -> str:
    """Fetch HTML and decode windows-1252, return cleaned text."""
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as resp:
        raw = resp.read()
    # SILGeneve HTML legacy ASP.NET : encoding windows-1252
    try:
        decoded = raw.decode("windows-1252")
    except UnicodeDecodeError:
        decoded = raw.decode("latin-1")

    soup = BeautifulSoup(decoded, "html.parser")
    # Remove scripts, styles
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    # Normalize whitespace
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_articles(full_text: str, law_tag: str):
    """
    Split le texte en articles. Pattern SILGeneve :
      Art. N       (ligne seule ou avec heading immédiat)
      Heading
      1 Body alinéa 1
      2 Body alinéa 2
      ...
      Art. N+1

    La table des matières en tête répète les Art. N avec juste leur heading ;
    on déduplique par article_num et on garde la version avec le body le
    plus long (= dans le corps de la loi).
    """
    lines = full_text.split("\n")

    # Cherche le début du corps : première occurrence de "Art. 1" suivie
    # de plus de 5 lignes dans les 20 suivantes (pas la TOC)
    art_re = re.compile(r"^Art\.\s*(\d+[a-z]?)(?:\s+(.*))?$")

    articles = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = art_re.match(line)
        if not m:
            i += 1
            continue

        art_num = m.group(1)
        inline_heading = (m.group(2) or "").strip()
        # Nettoie les marqueurs de modification (*, astérisques, etc.)
        inline_heading = re.sub(r"^\*+\s*", "", inline_heading).strip()

        heading = inline_heading
        j = i + 1

        # Si pas de heading inline, chercher sur la ligne suivante non vide
        if not heading:
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                candidate = lines[j].strip()
                if not art_re.match(candidate) and len(candidate) > 0:
                    heading = candidate[:200]
                    j += 1

        # Collecter le corps jusqu'au prochain Art. ou TOC-like section
        body_lines = []
        while j < len(lines):
            next_line = lines[j].strip()
            if art_re.match(next_line):
                break
            # Arrêt sur "Note :" isolé ou blocs de tableau > quelques lignes
            body_lines.append(next_line)
            j += 1

        body = "\n".join(l for l in body_lines if l).strip()

        articles.append({
            "article_num": art_num,
            "heading": heading,
            "body": body,
        })

        i = j

    # Déduplication : garder la version avec le body le plus long
    seen = {}
    for art in articles:
        key = art["article_num"]
        if key not in seen or len(art["body"]) > len(seen[key]["body"]):
            seen[key] = art

    # Filter : exclure les articles avec body trop court (probablement TOC)
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
            "topic": "loi_fiscale_ge",
            "date_version": "2026-01-01",
            "source": "silgeneve",
            "category": "loi-cantonale",
            "jurisdiction": "cantonal-GE",
            "canton": "GE",
            "url": law_info["url"],
        })
    return payloads


def main():
    print("=" * 60)
    print("LEXA - Ingestion lois fiscales GE (LCP + LIPP + LIPM)")
    print("=" * 60)

    all_chunks = []
    per_law_counts = {}

    for law_info in LAWS:
        slug = law_info["slug"]
        print(f"\n[FETCH] {law_info['law']} — {law_info['url']}")
        text = fetch_law(law_info["url"])
        print(f"  Extracted text: {len(text):,} chars")

        print(f"[PARSE] {law_info['law']}")
        articles = parse_articles(text, law_info["law"])
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

    # ── Tests RAG GE ────────────────────────────────────
    print("\n[RAG TEST] 3 queries représentatives Canton Genève:")
    queries = [
        "Déduction pilier 3a salarié Genève 2024",
        "Imposition bénéfice société anonyme Genève",
        "Contributions publiques communes Genève",
        "Impôt sur la fortune personne physique Genève",
        "Rattachement personnel canton Genève assujettissement",
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
            marker = "[GE]" if p.get("jurisdiction") == "cantonal-GE" else "    "
            print(f"    {marker} [{r.score:.3f}] {law} {art} — {heading}")

    print("\n" + "=" * 60)
    print(f"DONE — Collection: {final} points, GE net +{net_added}")
    print(f"  Per law: {per_law_counts}")
    print("=" * 60)


if __name__ == "__main__":
    main()
