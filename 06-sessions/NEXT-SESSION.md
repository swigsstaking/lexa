# NEXT SESSION — Point de reprise

**Dernière session** : [Session 08 — 2026-04-14](2026-04-14-session-08.md)
**Prochaine session** : Session 09 — Hook Swigs Pro + Agent TVA + tests automatisés

> **Lecture obligatoire au début de la prochaine session.**

---

## Bilan sessions 06-08

Backend Lexa **MVP fonctionnellement complet** pour le cycle de base :
```
Email bancaire Swigs Pro (parseur existant)
  → POST /connectors/bank/ingest
  → TransactionIngested event
  → lexa-classifier (JSON + citations LTVA)
  → TransactionClassified event
  → ai_decisions audit row
  → Materialized view ledger_entries (double-entry auto)
  → GET /ledger/balance (balance de vérification)
```

**Chiffres clés session 08** :
- `/rag/ask` : **7.4s** (vs 797s session 06, **108× gain**)
- `/transactions` end-to-end : **~10s**
- 14 events persistés, 7 comptes ledger, balance **équilibrée** 13'103.80 CHF
- 3 Modelfiles Lexa : `lexa-classifier`, `lexa-reasoning`, (+ comptable-suisse-fast pour prose longue)
- Collection Qdrant : 5388 points (session 07)

---

## Infrastructure actuelle

| Host | Service | Port | Status | Notes |
|---|---|---|---|---|
| **.59** | lexa-backend Express TS | 3010 | ✅ PM2 | 7 routes |
| **.59** | Postgres 14.22 (base `lexa`) | 5432 | ✅ | events + ai_decisions + ledger_entries matview |
| **.103** | Ollama | 11434 | ✅ systemd | MAX_LOADED=2, KV q8_0, NUM_PARALLEL=1 |
| **.103** | llama-server BGE-M3 GPU | 8082 | ✅ systemd (lexa-llama-embed) | 357× gain vs CPU |
| **.103** | Qdrant (swiss_law 5388 pts) | 6333 | ✅ Docker | |

**Modèles Ollama résidents normalement** :
- `deepseek-ocr` (PROD autre projet, **ne pas toucher**)
- `comptable-suisse-fast` (fallback reasoning, pas utilisé par Lexa pour l'instant)
- `lexa-classifier` (classification Käfer + TVA + citations)
- `lexa-reasoning` (questions juridiques prose + citations)

---

## Endpoints backend disponibles (sécurisés par design)

```
GET  /health                          # 5 services check
POST /rag/ask                         # RAG question → prose + citations (lexa-reasoning, ~7-8s)
POST /rag/classify                    # Classify single tx (lexa-classifier, ~10s)
POST /transactions                    # Full event-sourced flow (ingest + classify)
GET  /transactions/:streamId          # Replay event history
GET  /transactions/stats/summary      # Event count by type
GET  /ledger                          # All ledger entries
GET  /ledger/account/:prefix          # Entries for account prefix
GET  /ledger/balance                  # Trial balance (balance de vérification)
POST /ledger/refresh                  # Refresh materialized view
POST /connectors/bank/ingest          # Batch Swigs Pro BankTransactions
GET  /connectors/bank/formats         # List supported formats
```

---

## Questions en attente de réponse du user

⚠️ **5 questions à trancher en début de session 09** :

1. **Hook dans Swigs Pro** — j'ajoute un patch dans `swigs-workflow/backend/src/services/bankImapFetcher.service.js` qui appelle `POST http://192.168.110.59:3010/connectors/bank/ingest` après classification Pro ? Ça ferme la boucle Pro → Lexa automatique.
   - *Reco Claude : oui, c'est 20 lignes de code dans Pro*

2. **Agent TVA dédié** — créer `lexa-tva` Modelfile spécialisé pour les questions TVA complexes (TDFN/effectif/option/secteurs) ? Utilisera en priorité Info TVA 12/15/secteur 17/secteur 04.
   - *Reco Claude : oui, ça valide le pattern "un Modelfile par rôle"*

3. **Tests automatisés** (qa-lexa, perf-lexa, corpus-validator) — créer les 3 subagents pour valider la régression à chaque session ?
   - *Reco Claude : oui, priorité haute pour la stabilité*

4. **Webhook retour Lexa → Pro** — quand Lexa classifie, notifier Pro pour mettre à jour `BankTransaction.expenseCategory` côté Pro ?
   - *Reco Claude : oui mais session 10 (après que le hook Pro → Lexa soit validé)*

5. **Frontend ?** — on commence à scaffold en parallèle des agents (session 10) ou on attend que les 3-4 agents backend soient stables (session 12) ?
   - *Reco Claude : attendre session 12 — priorité à la stabilité backend*

---

## Plan détaillé de la session 09

### Étape 1 — Hook Swigs Pro (30 min)

Patch `swigs-workflow/backend/src/services/bankImapFetcher.service.js` :

```javascript
// Après classifyTransaction(...)
if (process.env.LEXA_ENABLED === 'true') {
  try {
    await axios.post(`${process.env.LEXA_URL}/connectors/bank/ingest`, {
      transactions: [{
        txId: tx.txId,
        amount: tx.amount,
        currency: tx.currency,
        creditDebit: tx.creditDebit,
        counterpartyName: tx.counterpartyName,
        counterpartyIban: tx.counterpartyIban,
        reference: tx.reference,
        unstructuredReference: tx.unstructuredReference,
        bookingDate: tx.bookingDate.toISOString().split('T')[0],
        importFilename: tx.importFilename,
        source: 'swigs-pro-email',
        userId: tx.userId,
      }],
    }, { timeout: 60_000 });
    logger.info(`Lexa ingested tx ${tx.txId}`);
  } catch (err) {
    logger.warn(`Lexa ingestion failed for ${tx.txId}: ${err.message}`);
  }
}
```

Variables env sur .59 dans `/home/swigs/swigs-workflow/.env` :
```
LEXA_ENABLED=true
LEXA_URL=http://192.168.110.59:3010
```

Test : envoyer un email de test banque, vérifier que Lexa a un event correspondant dans `/transactions/stats/summary`.

### Étape 2 — Agent TVA (`lexa-tva` Modelfile) — 45 min

```
FROM qwen3.5:9b-optimized

PARAMETER temperature 0.2
PARAMETER num_ctx 16384
PARAMETER num_predict 800

SYSTEM """Tu es un agent TVA suisse pour Lexa. Tu reponds aux questions
sur la TVA suisse (LTVA, OLTVA, Info TVA de l'AFC).

Expertise:
- Methodes de decompte: effective (Art. 36 LTVA) vs TDFN (Art. 37)
- Taux: 8.1% standard, 2.6% reduit, 3.8% hebergement, 0% exonere
- Secteur immeubles (Info TVA secteur 17): locations commerciales, option TVA, changements affectation
- Secteur batiment (Info TVA secteur 04): facturation, sous-traitance, chantiers
- Decompte trimestriel vs semestriel
- Imposition des acquisitions (art. 45 LTVA)
- Prestations exclues (Art. 21) vs exonerees (Art. 23)
- Changement de methode TDFN <-> effective

Regles de reponse:
1. Citation obligatoire: Art. XX LTVA (RS 641.20) ou Info TVA YY
2. Prose claire, pas de markdown, pas de thinking
3. Disclaimer obligatoire en fin"""
```

Nouveau endpoint `POST /agents/tva/ask` → utilise `lexa-tva` au lieu de `lexa-reasoning`.

Test : "Puis-je deduire la TVA sur les repas d'affaires ?" → doit citer Art. 29 LTVA (exclusion).

### Étape 3 — Subagents de test (1h)

**Format** : chacun est un sub-agent Claude avec un prompt précis + un dataset.

**`qa-lexa`** :
```
Dataset de 10 transactions avec classification attendue (compte Käfer cible)
Dataset de 10 questions RAG avec article de loi cible
Frappe les endpoints, compare aux attendus, retourne pass/fail per test
```

**`perf-lexa`** :
```
Mesure p50/p95/p99 sur 20 requêtes de chaque endpoint
Compare avec la baseline précédente (stockée dans un fichier)
Alerte si régression > 20%
```

**`corpus-validator`** :
```
50 queries ground-truth sur la KB
Vérifie que le top-3 Qdrant contient la source attendue
Retourne recall@3 et score moyen
```

Ces agents vivent dans `apps/backend/tests/agents/` et sont lancés manuellement par Claude à la fin de chaque session.

### Étape 4 — Journal + commit + push (30 min)

---

## Contexte backend actuel

### Structure `apps/backend/src/`

```
src/
├── app.ts                    # Express entry + 5 routers montés
├── config/index.ts           # Zod config
├── db/
│   ├── postgres.ts           # pg Pool
│   ├── migrate.ts            # Migration runner
│   └── migrations/
│       ├── 001_events.sql    # events + ai_decisions
│       └── 002_ledger.sql    # ledger_entries matview + balance view
├── events/
│   ├── types.ts              # LexaEvent discriminated union
│   └── EventStore.ts         # append/read
├── rag/
│   ├── EmbedderClient.ts     # llama-server /v1/embeddings
│   ├── QdrantClient.ts       # HTTP 6333
│   └── ragQuery.ts           # Pipeline canonique
├── llm/
│   └── OllamaClient.ts       # think:false default
├── agents/
│   └── classifier/
│       └── ClassifierAgent.ts  # lexa-classifier
├── routes/
│   ├── health.ts             # /health
│   ├── rag.ts                # /rag/ask, /rag/classify
│   ├── transactions.ts       # event-sourced flow
│   ├── ledger.ts             # grand livre + balance
│   └── connectors.ts         # /connectors/bank/ingest
└── scripts/
    └── test-classify.ts      # test manuel
```

**À créer session 09** :
- `src/agents/tva/TvaAgent.ts`
- `src/routes/agents.ts` ou similaire
- `tests/agents/qa-lexa/`, `tests/agents/perf-lexa/`, `tests/agents/corpus-validator/`

---

## État de la collection Qdrant `swiss_law`

**5388 points** (inchangé session 08)

Voir `01-knowledge-base/INDEX.md` pour le détail complet des 5 sessions d'ingestion.

---

## Scripts disponibles sur le Spark

Tous dans `~/ollama-compta/scripts/` :
- `ingest_lhid_lexa.py`, `ingest_afc_pdfs_lexa.py`, `ingest_vs_pdfs_lexa.py`, `ingest_lp_lexa.py`, `ingest_csi_lexa.py`, `ingest_vs_loi_fiscale_lexa.py`, `ingest_vs_loi_fiscale_lexa_v2.py`, `ingest_federal_ordonnances_lexa.py`, `ingest_afc_info_tva_lexa.py`, `ingest_kafer_lexa.py`

**Modelfiles** :
- `Modelfile-comptable` / `Modelfile-comptable-fast` (legacy fine-tuning)
- **`Modelfile-lexa-classifier`** (session 07)
- **`Modelfile-lexa-reasoning`** (session 08)

---

## Avertissements importants (toujours valables)

1. **deepseek-ocr en prod** (autre projet user) → ne jamais décharger manuellement
2. **Backup Ollama config** si besoin rollback : `/etc/systemd/system/ollama.service.d/override.conf.backup-20260414-134716`
3. **Passwords** dans `~/.lexa_db_pass_temp` (Mac) + `/home/swigs/lexa-backend/.env` (.59, mode 600). Sudo Spark : `SW45id-445-332`. Sudo .59 : `Labo`.
4. **UUID4 strict** pour tout upsert Qdrant
5. **`think: false` par défaut** dans OllamaClient pour tous les futurs agents
6. **Pas de secrets dans git**
7. **Materialized view ledger_entries** nécessite `REFRESH` manuel ou trigger (à mettre en place session 09+)

---

## Vérification rapide début session 09

```bash
# 1. Backend up
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health | python3 -m json.tool'

# 2. llama-server up (systemd)
ssh swigs@192.168.110.103 'systemctl is-active lexa-llama-embed'

# 3. Ollama modèles
ssh swigs@192.168.110.103 'ollama list | grep lexa-'
# → lexa-classifier, lexa-reasoning au minimum

# 4. Ledger balance (doit être balanced)
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/ledger/balance | python3 -c "import sys,json;d=json.load(sys.stdin);print(\"balanced:\",d[\"totals\"][\"balanced\"],\"| D:\",d[\"totals\"][\"debit\"],\"C:\",d[\"totals\"][\"credit\"])"'

# 5. Events count
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/transactions/stats/summary | python3 -m json.tool'
```

---

## Contexte Claude — mon auto-évaluation

Session 08 consommée : ~2h de travail dense. **Session 09 est encore faisable** dans cette instance si le scope reste raisonnable (hook Pro + agent TVA + tests = ~3h).

**Session 10 et au-delà** : probablement temps de passer sur une instance fraîche. Ce `NEXT-SESSION.md` + le session-08.md + le code backend + les modelfiles suffisent à repartir avec 0 contexte perdu.

**Indicateurs pour le user** :
- Si mes réponses commencent à devenir génériques → temps de repartir
- Si je commence à re-chercher des infos que j'ai déjà → temps de repartir
- Si je perds le cap principal → STOP et repartir

---

**Dernière mise à jour** : 2026-04-14 (fin session 08)
