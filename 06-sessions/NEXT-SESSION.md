# NEXT SESSION — Point de reprise

**Dernière session** : [Session 09 — 2026-04-14](2026-04-14-session-09.md)
**Prochaine session** : Session 10 — **Frontend Lexa** (pivot UX) + tests automatisés

> **Lecture obligatoire au début de la prochaine session.**

---

## Bilan sessions 06-09 — Lexa MVP fonctionnel

**Backend Lexa est production-ready** avec :
- 3 agents IA (classifier, reasoning, tva)
- Onboarding indépendant (UID register BFS)
- Event-sourcing + grand livre auto-balancé
- Pont Swigs Pro (inactif par défaut, activable par flag)
- 5388 points KB Qdrant (5/5 lois fédérales, 4/4 ordonnances, 14 circulaires, Info TVA, VS loi fiscale, Käfer)
- Perf : `/rag/ask` 7.4s, `/transactions` 10s, `/agents/tva/ask` 15.8s, `/onboarding/company/search` 278ms

**L'étape suivante logique = frontend** pour que le user/les clients puissent utiliser Lexa sans curl.

---

## Infrastructure actuelle

| Host | Service | Port | Status |
|---|---|---|---|
| **.59** | lexa-backend (Express TS) | 3010 | ✅ PM2, **10 routes** |
| **.59** | Postgres 14.22 (base lexa) | 5432 | ✅ 3 migrations appliquées |
| **.59** | swigs-workflow (patch Lexa bridge) | 3004 | ✅ PM2, hook inactif par défaut |
| **.103** | Ollama (lexa-classifier/reasoning/tva + deepseek-ocr) | 11434 | ✅ systemd |
| **.103** | llama-server BGE-M3 GPU | 8082 | ✅ systemd lexa-llama-embed |
| **.103** | Qdrant (swiss_law 5388 pts) | 6333 | ✅ Docker |

---

## Endpoints backend complets (10 routes)

```
GET  /health                          # 5 services check
POST /rag/ask                         # Question juridique (lexa-reasoning, 7.4s)
POST /rag/classify                    # Classifier single tx (lexa-classifier, 10s)
POST /agents/tva/ask                  # Agent TVA spécialisé (lexa-tva, 15.8s, 5 citations)
GET  /agents                          # Liste agents actifs + planifiés
POST /transactions                    # Event-sourced flow
GET  /transactions/:streamId          # Replay event history
GET  /transactions/stats/summary      # Stats events
GET  /ledger                          # Grand livre entries
GET  /ledger/account/:prefix          # Entries par compte
GET  /ledger/balance                  # Balance de vérification
POST /ledger/refresh                  # Refresh materialized view
POST /connectors/bank/ingest          # Push Swigs Pro BankTransactions
GET  /connectors/bank/formats         # Formats supportés
GET  /onboarding/company/search?q=    # 🆕 Search UID register BFS
POST /onboarding/company              # 🆕 Create company (UID or manual)
GET  /onboarding/company/:tenantId    # 🆕 Fetch company
PATCH /onboarding/company/:tenantId   # 🆕 Update partial
```

---

## Modelfiles Lexa sur Spark

| Modelfile | Base | Taille | Usage |
|---|---|---|---|
| `lexa-classifier` | qwen3.5:9b-optimized + Käfer | 10 GB | Classification transactions JSON |
| `lexa-reasoning` | qwen3.5:9b-optimized + lois CH | 10 GB | Questions juridiques générales |
| **`lexa-tva`** (🆕 session 09) | qwen3.5:9b-optimized + LTVA/Info TVA | 10 GB | Agent TVA spécialisé |
| À créer | qwen3.5:9b + lois cantonales SR | — | `lexa-fiscal-pp` (PP Valais/Genève) |
| À créer | qwen3.5:9b + CO + LIFD | — | `lexa-fiscal-pm` (Sàrl/SA) |

---

## Questions pour session 10

⚠️ **À trancher en début de session 10** :

1. **Frontend — go / no-go** — les backends sont stables, ma reco : **GO**. Stack :
   - React 18 + Vite 5 + TypeScript strict
   - TailwindCSS 3
   - Zustand (state) + TanStack Query (server state)
   - react-flow OU tldraw pour le canvas (à benchmarker)
   - framer-motion pour animations
   - i18next (FR primary)
   - Premier run : scaffold + /health + /onboarding wizard + /rag/ask + /transactions feed
   
2. **Canvas library** — react-flow ou tldraw ? Je peux lancer un benchmark en début session 10.

3. **Webhook Lexa → Pro** — à faire session 10 ou session 11 ?
   - *Reco : session 11, focus frontend en 10*

4. **Activer le pont `LEXA_ENABLED=true`** — on l'active en live pour valider la boucle en prod ?
   - *Reco : oui, dès début session 10. Zéro risque puisque non-bloquant*

5. **Tests automatisés** (qa-lexa, perf-lexa, corpus-validator) — session 10 ou session 11 ?
   - *Reco : session 11, ou session 10 seulement si reste du temps après frontend scaffold*

---

## Plan détaillé de la session 10 (frontend focus)

### Étape 1 — Activer LEXA_ENABLED sur .59 (5 min)

```bash
ssh swigs@192.168.110.59 "
  echo 'LEXA_ENABLED=true' >> /home/swigs/swigs-workflow/.env
  echo 'LEXA_URL=http://192.168.110.59:3010' >> /home/swigs/swigs-workflow/.env
  pm2 restart swigs-workflow
  pm2 logs swigs-workflow --lines 10 --nostream
"
```

Vérifier qu'aucune erreur n'apparaît après restart.

### Étape 2 — Scaffold `apps/frontend/` (1h)

```bash
cd /Users/corentinflaction/CascadeProjects/lexa/apps
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom @tanstack/react-query zustand axios tailwindcss@^3 autoprefixer postcss framer-motion lucide-react zod
npm install -D @types/node
npx tailwindcss init -p
```

**Structure** :
```
apps/frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── Home.tsx
│   │   ├── Onboarding.tsx       # Wizard adapté du WelcomeModal Pro
│   │   ├── Dashboard.tsx
│   │   ├── Transactions.tsx
│   │   ├── Ledger.tsx
│   │   └── Chat.tsx             # Chat avec les 3 agents
│   ├── components/
│   │   ├── CompanySearchField.tsx  # Adapté du composant Pro
│   │   ├── StepWizard.tsx
│   │   └── ...
│   ├── api/
│   │   ├── client.ts            # axios instance → .59:3010
│   │   └── lexa.ts              # typed endpoints
│   ├── stores/
│   │   ├── companyStore.ts
│   │   └── transactionsStore.ts
│   └── styles/
```

### Étape 3 — Onboarding wizard (1h30)

Adapter le `WelcomeModal.jsx` de Pro (743 lignes, 4 étapes) pour Lexa :
1. **Step 0 — Welcome** : intro + logo
2. **Step 1 — Entreprise** : CompanySearchField (UID register) + autofill OU saisie manuelle
3. **Step 2 — TVA** : assujetti ?, méthode (effective/TDFN), fréquence
4. **Step 3 — Banque + RIB** : IBAN, QR-IBAN

À la fin, `POST /onboarding/company` → redirige vers dashboard avec `tenantId`.

### Étape 4 — Dashboard minimal (45 min)

- **Header** : nom entreprise + UID + canton
- **Stats** : nombre d'events, balance grand livre
- **Recent transactions** : liste des 10 dernières avec classification
- **Agent chat** : textarea pour poser une question aux 3 agents (switch classifier/reasoning/tva)

### Étape 5 — PM2 deploy frontend build sur .59 (30 min)

Nginx conf pour servir `apps/frontend/dist/` sur un nouveau port (ex: 3011 ou via un path `/lexa/`) + rsync du build.

### Étape 6 — Journal + commit + push (30 min)

---

## Architecture backend actuelle (pour comprendre rapidement)

```
apps/backend/src/
├── app.ts                       # Express + 8 routers
├── config/index.ts              # Zod env config
├── db/
│   ├── postgres.ts              # pg Pool
│   ├── migrate.ts               # Migration runner
│   └── migrations/
│       ├── 001_events.sql       # events + ai_decisions
│       ├── 002_ledger.sql       # materialized view + balance
│       └── 003_companies.sql    # 🆕 onboarding
├── events/
│   ├── types.ts                 # LexaEvent union
│   └── EventStore.ts
├── rag/
│   ├── EmbedderClient.ts        # llama-server 8082 /v1/embeddings
│   ├── QdrantClient.ts          # HTTP 6333
│   └── ragQuery.ts              # Pipeline canonique
├── llm/
│   └── OllamaClient.ts          # think:false default
├── agents/
│   ├── classifier/ClassifierAgent.ts   # lexa-classifier
│   └── tva/TvaAgent.ts                 # 🆕 lexa-tva + re-rank
├── services/
│   └── companyLookup.ts         # 🆕 UID register BFS SOAP
└── routes/
    ├── health.ts
    ├── rag.ts
    ├── agents.ts                # 🆕
    ├── transactions.ts
    ├── ledger.ts
    ├── connectors.ts
    └── onboarding.ts            # 🆕
```

---

## Avertissements importants

1. **`LEXA_ENABLED` non activé par défaut** sur .59 — le hook existe mais n'appelle pas Lexa tant que tu ne l'ajoutes pas à l'env Pro
2. **Backend swigs-workflow en prod** — commit `98b6c1b` (branche `v2-refresh`), PM2 restart OK, aucune erreur
3. **Backend Lexa en prod** — commit `63db503` (branche `main`), PM2 restart OK
4. **3 migrations appliquées** : `001_events`, `002_ledger`, `003_companies`
5. **Modelfiles sur Spark** : `lexa-classifier`, `lexa-reasoning`, `lexa-tva` (tous 10 GB, base qwen3.5:9b)
6. **Sudo Spark** : `SW45id-445-332`. Sudo .59 : `Labo`
7. **Password Postgres lexa_app** : `~/.lexa_db_pass_temp` (Mac) + `/home/swigs/lexa-backend/.env` (.59)

---

## Vérification rapide début session 10

```bash
# Backend health
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health | python3 -m json.tool'

# Agents list
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/agents | python3 -m json.tool'

# UID search test
ssh swigs@192.168.110.59 'curl -s "http://localhost:3010/onboarding/company/search?q=swigs" | python3 -m json.tool'

# Ledger balance (doit rester balanced)
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/ledger/balance | python3 -c "import sys,json;d=json.load(sys.stdin);print(\"balanced:\",d[\"totals\"][\"balanced\"])"'

# Modèles Ollama
ssh swigs@192.168.110.103 'ollama list | grep -E "lexa-|deepseek"'
```

---

## Contexte Claude — auto-évaluation

Session 09 a été **dense et productive**. Session 10 (frontend scaffold) est faisable dans cette instance mais **demande plusieurs heures d'écriture React/Tailwind**. Je recommande de **démarrer sur une instance fraîche** pour la session 10 — tout est documenté ici pour reprendre à zéro sans perte d'info.

**Instructions pour la reprise sur instance fraîche** :
1. Lire `06-sessions/NEXT-SESSION.md` (ce document, 5 min)
2. Lire `06-sessions/2026-04-14-session-09.md` (journal complet, 10 min)
3. Vérifier les 5 commandes de check ci-dessus
4. Attaquer le plan session 10 directement

---

**Dernière mise à jour** : 2026-04-14 (fin session 09)
