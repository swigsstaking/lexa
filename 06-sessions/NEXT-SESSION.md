# NEXT SESSION — Point de reprise

**Dernière session** : [Session 05 — 2026-04-14](2026-04-14-session-05.md)
**Prochaine session** : Session 06 — **Scaffold backend** (pivot majeur)

> **Lecture obligatoire au début de la prochaine session.** Ce fichier est écrasé à chaque fin de session.

---

## Pivot majeur en session 06

Après 5 sessions de fondations KB, **la phase 0 est quasi-terminée**. La KB fédérale est suffisante pour démarrer le développement applicatif. **Session 06 = premier scaffold du backend Lexa**.

---

## Où on en est

**Phase** : Fin de phase 0 (KB quasi-complète) → Début phase 1 (scaffold applicatif)

**Progrès cumulés sessions 01-05** :

| Session | Livrables clés | Qdrant |
|---|---|---|
| 01 | Whitepaper, archi, roadmap, KB index | 791 |
| 02 | Git init + push, LHID, décisions user | 899 |
| 03 | 15 docs AFC + 4 docs VS (Notice A, 14 Circ IFD, Guide PP, barème...) | 3007 |
| 04 | LP + CSI 28 + Loi fiscale VS via Playwright | 4058 |
| 05 | Postgres installé, VS fix, 4 ordonnances, **4 Info TVA via JSF** | **5322** |

**Collection Qdrant `swiss_law` : 5322 points**

**KB fédérale** : 5/5 lois clés (LIFD, LTVA, LHID, CO, LP) + 4/4 ordonnances clés (OIFD, OLTVA, OIA, ORC) + 14 circulaires IFD + Notice A + CSI 28 + commentaire + **4 Info TVA webpublications** (TVA 12 TDFN, TVA 15 Décompte, secteur 17 Immeubles, secteur 04 Bâtiment).

**KB cantonale VS** : Loi fiscale 339 articles + Guide PP 2024 + barème 2026 + déductions + directives impôt source.

**Infra** :
- ✅ Postgres 14.22 sur 192.168.110.59 (base `lexa`, user `lexa_app`)
- ✅ Qdrant + Ollama + BGE-M3 + Playwright + Chromium sur 192.168.110.103
- ✅ Repo github.com/swigsstaking/lexa à jour

---

## Questions en attente de réponse du user

⚠️ **5 questions à trancher en début de session 06** :

1. **Scaffold backend OK pour session 06 ?** — KB suffisante, Postgres prêt, patterns définis.
   - *Reco Claude : oui, c'est le moment*

2. **Canton Genève en parallèle ou laisser à session 07-08 ?**
   - *Reco Claude : laisser, focus total sur le backend*

3. **Plan comptable Käfer structuré** — l'extraire en session 06 ?
   - *Reco Claude : oui, c'est rapide (30 min) et directement utile pour l'agent Classifier*

4. **Standards techniques** (eCH-0217, CAMT.053, Swissdec, QR) — priorité ?
   - *Reco Claude : eCH-0217 + CAMT.053 session 06-07, Swissdec + QR plus tard*

5. **Fine-tuning LoRA** — relancer ou skip définitif ?
   - *Reco Claude : skip définitif v1, le RAG actuel est déjà excellent (scores jusqu'à 0.778)*

---

## Plan détaillé de la session 06 (scaffold backend)

### Étape 1 — Créer le repo `lexa-backend` (30 min)

```bash
cd /Users/corentinflaction/CascadeProjects
mkdir lexa-backend && cd lexa-backend
npm init -y
npm install express typescript tsx @types/node @types/express pg @types/pg mongoose ioredis
npm install -D nodemon eslint prettier @typescript-eslint/eslint-plugin
```

Structure :
```
lexa-backend/
├── src/
│   ├── app.ts                  # Express entry
│   ├── config/
│   │   └── index.ts           # Config from env
│   ├── db/
│   │   ├── postgres.ts         # Postgres connection (pg-promise ou pg)
│   │   ├── mongo.ts            # Mongo connection (mongoose)
│   │   └── migrations/
│   │       └── 001_events.sql
│   ├── events/
│   │   ├── EventStore.ts      # Write/read events
│   │   ├── types.ts            # Event type definitions
│   │   └── projections/
│   ├── rag/
│   │   ├── QdrantClient.ts    # Wrapper HTTP vers Qdrant 6333
│   │   ├── Embedder.ts         # BGE-M3 via HTTP (ou direct Python bridge)
│   │   └── ragQuery.ts         # Port du pipeline Python test_rag.py
│   ├── agents/
│   │   ├── Orchestrator.ts
│   │   └── classifier/
│   │       ├── ClassifierAgent.ts
│   │       └── prompts.ts
│   ├── llm/
│   │   └── OllamaClient.ts    # HTTP vers Ollama .103:11434
│   └── routes/
│       ├── health.ts
│       └── rag.ts              # Test endpoint pour le RAG
├── tsconfig.json
├── .env.example
├── .gitignore
└── package.json
```

### Étape 2 — Event store Postgres (1h)

Schema SQL minimal :

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  stream_id UUID NOT NULL,
  sequence BIGINT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_stream_seq_unique UNIQUE (tenant_id, stream_id, sequence)
);

CREATE INDEX idx_events_tenant_stream ON events (tenant_id, stream_id);
CREATE INDEX idx_events_type ON events (type);
CREATE INDEX idx_events_occurred ON events (occurred_at);
CREATE INDEX idx_events_payload_gin ON events USING GIN (payload);

-- Row-Level Security pour multi-tenant
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_tenant_isolation ON events
  FOR ALL USING (tenant_id = current_setting('lexa.tenant_id')::uuid);
```

Écrire `src/db/migrations/001_events.sql` + un script `npm run migrate`.

Classe `EventStore` :
```typescript
class EventStore {
  async append(tenantId: string, streamId: string, type: string, payload: object): Promise<void>;
  async read(tenantId: string, streamId: string, fromSeq?: number): Promise<Event[]>;
  async readByType(tenantId: string, type: string, limit?: number): Promise<Event[]>;
}
```

### Étape 3 — Port du pipeline RAG Python → TypeScript (1-2h)

Le pipeline Python actuel :
1. Embed la query avec BGE-M3
2. Query Qdrant
3. Format le context
4. Envoie à Ollama `comptable-suisse`
5. Retourne la réponse avec citations

Port TS :
- `Embedder` : wrapper HTTP vers le Spark (BGE-M3 est en Python). Options :
  - (a) Créer un micro-service Python sur le Spark qui expose BGE-M3 en HTTP (FastAPI, port 8001)
  - (b) Utiliser Ollama pour les embeddings avec un modèle spécifique (pas BGE-M3)
  - (c) Porter BGE-M3 en TS via ONNX (plus complexe)
  - **Reco** : (a) — micro-service Python minimal sur le Spark, 50 lignes
- `QdrantClient` : HTTP direct sur `http://192.168.110.103:6333/collections/swiss_law/points/search`
- `OllamaClient` : HTTP direct sur `http://192.168.110.103:11434/api/generate`
- `ragQuery(question)` : compose les 3 clients ensemble

### Étape 4 — Agent Classifier minimal (1h)

```typescript
class ClassifierAgent {
  async classify(transaction: {
    date: string;
    description: string;
    amount: number;
    counterparty?: string;
  }): Promise<{
    debit_account: string;
    credit_account: string;
    tva_rate: number;
    confidence: number;
    citations: Citation[];
    reasoning: string;
  }>
}
```

Utilise le RAG pour retrouver le contexte Käfer pertinent + appelle `comptable-suisse-fast` avec un prompt spécifique.

Test end-to-end sur 10 transactions d'exemple.

### Étape 5 — Micro-service BGE-M3 sur le Spark (30 min)

```python
# /home/swigs/lexa-embed-service/app.py
from fastapi import FastAPI
from pydantic import BaseModel
from FlagEmbedding import BGEM3FlagModel

app = FastAPI()
model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True, device="cuda")

class EmbedRequest(BaseModel):
    texts: list[str]

@app.post("/embed")
def embed(req: EmbedRequest):
    vecs = model.encode(req.texts, return_dense=True)["dense_vecs"]
    return {"vectors": [v.tolist() for v in vecs]}
```

Lancé via PM2/uvicorn sur le port 8001 (local Spark).

### Étape 6 — PM2 deploy sur .59 (30 min)

```bash
rsync -avz --exclude='node_modules' --exclude='.env' lexa-backend/ swigs@192.168.110.59:/home/swigs/lexa-backend/
ssh swigs@192.168.110.59 'cd /home/swigs/lexa-backend && npm ci && pm2 start npm --name lexa-backend -- start'
```

Vérifier :
```bash
curl http://192.168.110.59:3010/health
# => { ok: true, version: "0.1.0" }
```

### Étape 7 — Plan comptable Käfer structuré (30 min)

Extraire du system prompt `comptable-suisse` en YAML structuré :

```yaml
# ~/ollama-compta/plan_comptable_kafer.yaml
accounts:
  - id: "1000"
    label: "Caisse"
    class: 1
    type: "balance_sheet_asset"
    nature: "liquid"
  - id: "1020"
    label: "Banque - compte courant"
    class: 1
    ...
```

Ingérer dans Qdrant avec topic `plan_comptable_kafer`.

### Étape 8 — Journal + commit + push (30 min)

Créer `06-sessions/2026-04-DD-session-06.md`, mettre à jour NEXT-SESSION pour session 07, commit + push.

---

## État actuel de la collection Qdrant `swiss_law` (5322 pts)

### Fédéral (lois & ordonnances) ✅
- LTVA 131, LIFD 224, CO 421, LHID 108, LP 397 (5 lois, 1281 articles)
- OIFD 7, OLTVA 175, OIA 75, ORC 191 (4 ordonnances, 448 articles)

### Fédéral (pratique AFC/CSI)
- Notice A 1995 : 16 chunks
- 14 circulaires IFD : ~1864 chunks
- CSI Circ 28 2022 : ~300 chunks
- CSI Circ 28 Commentaire : ~179 chunks

### Fédéral (Info TVA via JSF) ✅
- Info TVA 12 TDFN : 203 chunks
- Info TVA 15 Décompte : 73 chunks
- Info TVA secteur 17 Immeubles : 257 chunks
- Info TVA secteur 04 Bâtiment : 119 chunks
- **Total : 652 chunks, scores RAG 0.66-0.78** (les meilleurs)

### Cantonal VS ✅ (premier canton SR couvert)
- Loi fiscale 642.1 : **339 articles** (v2 parser)
- Guide déclaration PP 2024 : 169 chunks
- Barème 2026 : 5 chunks
- Déductions forfaitaires 2025 : 14 chunks
- Directives impôt source 2025 : 40 chunks

---

## Scripts d'ingestion disponibles sur le Spark

| Script | Rôle | Destructif ? |
|---|---|---|
| `~/ingest_swiss_law.py` | Parser Fedlex XML LTVA+LIFD+CO (session 01) | ⚠️ **OUI** |
| `~/ollama-compta/scripts/ingest_laws_v2.py` | Articles hardcodés additifs (session 01) | ❌ Non |
| `~/ollama-compta/scripts/ingest_lhid_lexa.py` | LHID (session 02) | ❌ Non |
| `~/ollama-compta/scripts/ingest_afc_pdfs_lexa.py` | Notice A + 14 circulaires IFD (session 03) | ❌ Non |
| `~/ollama-compta/scripts/ingest_vs_pdfs_lexa.py` | 4 PDFs fiscaux Valais (session 03) | ❌ Non |
| `~/ollama-compta/scripts/ingest_lp_lexa.py` | LP (session 04) | ❌ Non |
| `~/ollama-compta/scripts/ingest_csi_lexa.py` | CSI Circ 28 + commentaire (session 04) | ❌ Non |
| `~/ollama-compta/scripts/ingest_vs_loi_fiscale_lexa.py` | Loi fiscale VS v1 (session 04) | ❌ Non |
| `~/ollama-compta/scripts/ingest_vs_loi_fiscale_lexa_v2.py` | Loi fiscale VS v2 (session 05) — delete then upsert | ⚠️ Delete filtered |
| `~/ollama-compta/scripts/ingest_federal_ordonnances_lexa.py` | OIFD + OLTVA + OIA + ORC (session 05) | ❌ Non |
| `~/ollama-compta/scripts/ingest_afc_info_tva_lexa.py` | 4 Info TVA via flow JSF (session 05) | ❌ Non |

---

## Configuration backend (pour session 06)

**Serveur** : `swigs@192.168.110.59` (sw6c-1)
**Postgres** : 14.22, base `lexa`, user `lexa_app`, password dans `~/.lexa_db_pass_temp` sur Mac local
**Port backend** : `3010`
**Path install** : `/home/swigs/lexa-backend/` (à créer)
**Stack** : Node 20.19, TypeScript, Express, pg, mongoose, ioredis, axios (pour HTTP vers Spark)

**Endpoints Spark** (.103) à consommer depuis le backend (.59) :
- Ollama : `http://192.168.110.103:11434/api/generate`
- Qdrant : `http://192.168.110.103:6333/collections/swiss_law`
- BGE-M3 (à créer) : `http://192.168.110.103:8001/embed`

**SSH** entre .59 et .103 : vérifier que la route réseau existe (ils sont sur le même sous-réseau .110.0/24, devrait marcher).

---

## Modèles sur le DGX Spark

| Modèle | Taille | Usage backend |
|---|---|---|
| `comptable-suisse` | 29 GB (Q8) | Agents fiscal complexes (batch) |
| `comptable-suisse-fast` | 17 GB (Q4) | Classifier, chat interactif |
| `qwen3-vl-ocr` | 6.1 GB | OCR factures (phase 2) |
| BGE-M3 | ~2 GB | Embeddings RAG (via micro-service à créer session 06) |

Ollama : `OLLAMA_FLASH_ATTENTION=1`, `KEEP_ALIVE=-1`.

---

## Avertissements importants

1. **Ne jamais toucher aux processes Ollama** sur le Spark (prod autres projets).
2. **Ne pas supprimer `~/ollama-compta/`** (prototype user).
3. **Ne jamais relancer `~/ingest_swiss_law.py`** (destructif).
4. **UUID4 strict** pour tout nouvel upsert Qdrant.
5. **BGE-M3 sur CPU** — pour les gros batches, prévoir le temps.
6. **Password Postgres** dans `~/.lexa_db_pass_temp` sur Mac, **jamais commit** — à déplacer dans `lexa-backend/.env` (git-ignoré).
7. **Pas de secrets dans le repo git** sous aucun prétexte.

---

**Dernière mise à jour** : 2026-04-14 (fin session 05)
