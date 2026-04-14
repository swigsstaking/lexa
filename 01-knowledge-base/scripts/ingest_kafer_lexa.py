#!/usr/bin/env python3
"""Lexa - Ingest structured Kafer plan into Qdrant with topic=plan_comptable_kafer."""
import sys
import uuid
import yaml
import requests
import time

sys.path.insert(0, "/home/swigs/.local/lib/python3.12/site-packages")
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

COLLECTION = "swiss_law"
QDRANT = "localhost"
EMBED_URL = "http://localhost:8082/v1/embeddings"

with open("/home/swigs/ollama-compta/plan_kafer.yaml") as f:
    data = yaml.safe_load(f)

accounts = data["accounts"]
classes = data["classes"]

print("Plan:", data["name"], "v", data["version"])
print("Accounts:", len(accounts))

chunks = []
for acc in accounts:
    class_info = classes.get(str(acc["class"]), {})
    parts = [
        "Plan comptable PME suisse (Kafer) - compte " + acc["id"],
        "Libelle: " + acc["label"],
        "Classe: " + str(acc["class"]) + " (" + class_info.get("label", "") + ")",
        "Type: " + acc["type"],
    ]
    if acc.get("nature"):
        parts.append("Nature: " + acc["nature"])
    if acc.get("description"):
        parts.append("Description: " + acc["description"])
    if acc.get("default_tva_rate") is not None:
        parts.append("Taux TVA par defaut: " + str(acc["default_tva_rate"]) + "%")
    if acc.get("default_tva_code"):
        parts.append("Code TVA: " + acc["default_tva_code"])
    if acc.get("depreciation_rate_afc"):
        parts.append("Taux amortissement AFC: " + str(acc["depreciation_rate_afc"]) + "%")
    if acc.get("source"):
        parts.append("Source: " + acc["source"])
    text = " | ".join(parts)
    chunks.append({
        "text": text,
        "law": "Plan-Kafer",
        "law_label": "Plan comptable PME suisse (Kafer)",
        "article": "compte " + acc["id"],
        "article_num": acc["id"],
        "heading": acc["label"],
        "rs": None,
        "topic": "plan_comptable_kafer",
        "category": acc["type"],
        "account_class": acc["class"],
        "account_nature": acc.get("nature"),
        "default_tva_rate": acc.get("default_tva_rate"),
        "depreciation_rate_afc": acc.get("depreciation_rate_afc"),
        "date_version": "2024-01-01",
        "source": "kafer",
    })

print("Built", len(chunks), "chunks")

print("Embedding via llama-server 8082...")
t0 = time.time()
r = requests.post(
    EMBED_URL,
    json={"input": [c["text"] for c in chunks]},
    timeout=60,
)
r.raise_for_status()
sorted_items = sorted(r.json()["data"], key=lambda x: x["index"])
vecs = [item["embedding"] for item in sorted_items]
print("Embedded", len(vecs), "vectors in", round(time.time() - t0, 2), "s")

client = QdrantClient(host=QDRANT, port=6333)
before = client.get_collection(COLLECTION).points_count
print("Before:", before)

try:
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key="law", match=MatchValue(value="Plan-Kafer"))]
        ),
    )
    after_del = client.get_collection(COLLECTION).points_count
    print("After delete Plan-Kafer existing:", after_del)
except Exception as e:
    print("Delete skipped:", e)

points = [
    PointStruct(id=str(uuid.uuid4()), vector=v, payload=c)
    for c, v in zip(chunks, vecs)
]
client.upsert(collection_name=COLLECTION, points=points)
after = client.get_collection(COLLECTION).points_count
print("After upsert:", after, "(+", after - before, ")")

print()
print("=== Test RAG Kafer ===")
queries = [
    "compte caisse plan comptable",
    "amortissement vehicule taux AFC",
    "compte loyer TVA deductible",
    "impot prealable TVA",
    "compte salaire AVS charges sociales",
]
for q in queries:
    qr = requests.post(EMBED_URL, json={"input": [q]}).json()
    qvec = qr["data"][0]["embedding"]
    results = client.query_points(
        collection_name=COLLECTION, query=qvec, limit=3, with_payload=True
    ).points
    print()
    print("Q:", q)
    for hit in results:
        p = hit.payload
        mark = "[KAFER]" if p.get("law") == "Plan-Kafer" else "       "
        heading = (p.get("heading") or "")[:50]
        print("  ", mark, "[" + ("%.3f" % hit.score) + "]", p.get("law"), p.get("article"), "-", heading)

print()
print("DONE")
