# NEXT SESSION — Point de reprise

**Dernière session** : [Session 07 — 2026-04-14](2026-04-14-session-07.md)
**Prochaine session** : Session 08 — Agents + projections event store + CAMT.053

> **Lecture obligatoire au début de la prochaine session.**

---

## Où on en est — bilan session 07

**Session 07 = session la plus ambitieuse à ce jour**. Gains mesurés :

| Métrique | Session 06 | Session 07 | Gain |
|---|---|---|---|
| `/rag/ask` | 797s | **43s** | **18.5×** |
| `/transactions` (event-sourced) | — | **9.8s** | créé |
| BGE-M3 embedding | ~10s | **28ms** | **357×** |
| BGE-M3 ingestion 66 chunks | ~53s | **0.58s** | **91×** |
| Ollama tok/s | 0.8 | **11.5-22** | **14-27×** |

**Le pipeline Lexa complet est production-ready pour MVP** :
- `POST /transactions` → classify Käfer + citations LTVA → event store → audit trail en **10 secondes**
- `GET /transactions/:streamId` → replay historique
- `GET /transactions/stats/summary` → stats events

---

## Infrastructure actuelle (sécurisée)

| Host | Service | Port | Systemd | Notes |
|---|---|---|---|---|
| **.59** | lexa-backend (Express TS) | 3010 | PM2 | Event-sourced OK |
| **.59** | Postgres 14.22 (base `lexa`) | 5432 | systemd | events + ai_decisions |
| **.59** | MongoDB | 27017 | systemd | (pas encore utilisé par Lexa) |
| **.59** | Redis | 6379 | systemd | (pas encore utilisé) |
| **.103** | Ollama | 11434 | systemd | Config optimale, MAX_LOADED=2 |
| **.103** | llama-server BGE-M3 GPU | **8082** | **systemd (lexa-llama-embed)** | 200× gain |
| **.103** | Qdrant (swiss_law 5388 pts) | 6333 | Docker | |
| **.103** | ~~lexa-embed Python (8001)~~ | — | ~~killed~~ | Remplacé par 8082 |

**Backend .59** :
```bash
curl http://192.168.110.59:3010/health
# → {"ok":true, "qdrantPoints":5388, 5 services verts}
```

---

## Modèles Ollama résidents actuels

| Modèle | Taille | Usage |
|---|---|---|
| `deepseek-ocr` | 9.7 GB | ⚠️ **PROD autre projet** — ne jamais toucher |
| `comptable-suisse-fast` | 22 GB Q4 | `/rag/ask` Lexa (reasoning + citations) |
| `lexa-classifier` | 10 GB | **Classifier Lexa** (JSON parfait, 22 tok/s) |

Unloaded mais reloadables auto : `comptable-suisse` Q8, `qwen3.5:9b-nothink`, `qwen3-vl*`, autres.

---

## Ce qu'il faut lire AVANT de démarrer la session 08

1. **`06-sessions/2026-04-14-session-07.md`** — journal complet (15 min) — **essentiel**
2. **`apps/backend/src/routes/transactions.ts`** — event-sourced flow (5 min)
3. **`apps/backend/src/agents/classifier/ClassifierAgent.ts`** — pattern agent (5 min)
4. **`01-knowledge-base/plan_kafer.yaml`** — structure Käfer (3 min)

**Total : ~30 min**

---

## Questions en attente de réponse du user

⚠️ **4 questions à trancher en début de session 08** :

1. **CAMT.053 parser** — priorité #1 pour session 08 ? Permet d'importer un fichier bancaire XML ISO 20022 → déclencher le flow `/transactions` pour chaque ligne. **C'est le connecteur qui rend Lexa utilisable en vrai**.
   - *Reco Claude : oui, priorité absolue*

2. **Agent TVA** — créer le 2ème agent qui utilise Info TVA 12/15 ingérés + Modelfile `lexa-tva` dédié ?
   - *Reco Claude : oui, après CAMT.053*

3. **Optim `/rag/ask`** — créer `lexa-reasoning` Modelfile (qwen3.5:9b + SYSTEM cite lois) pour passer de 43s à ~15s ?
   - *Reco Claude : oui, facile (30 min)*

4. **Projections event store** — premières projections (grand livre, balance, compte résultat) à partir des events ?
   - *Reco Claude : commencer par grand livre simple en SQL vue, les autres plus tard*

---

## Plan détaillé de la session 08

### Étape 1 — Agents de test (qa-lexa + perf-lexa) — 45 min

Créer 2 subagents réutilisables :
- **qa-lexa** : frappe les endpoints avec un dataset de test et vérifie les réponses
- **perf-lexa** : mesure p50/p95 des endpoints et compare avant/après

Usage : lancés en fin de session pour valider la régression.

### Étape 2 — Parser CAMT.053 — 1h30

Créer `apps/backend/src/connectors/camt053.ts` :
- Parse XML ISO 20022 CAMT.053.001.xx
- Extrait les lignes de transaction (`<Ntry>`)
- Convertit en `BankTransaction[]` compatible `POST /transactions`
- Endpoint `POST /connectors/camt053` → batch import

Test avec un fichier CAMT.053 réel (à demander au user ou générer un échantillon).

### Étape 3 — Agent TVA — 1h

Modelfile `lexa-tva` basé sur qwen3.5:9b avec SYSTEM spécialisé TVA :
- Connaît LTVA + Info TVA 12 (TDFN) + Info TVA 15 (décompte)
- Retourne JSON avec : taux applicable, code TVA, exonération éventuelle, citation
- Input : transaction + contexte (secteur, destination, type de prestation)

Endpoint `POST /agents/tva/classify` : retourne la classification TVA détaillée.

### Étape 4 — Projection Grand Livre — 45 min

Migration `002_grand_livre.sql` :
```sql
CREATE MATERIALIZED VIEW grand_livre_current AS
SELECT
  tenant_id,
  (payload->>'debitAccount') AS account,
  occurred_at::date AS entry_date,
  (payload->>'description') AS description,
  (payload->>'amountHt')::numeric AS amount_ht,
  (payload->>'amountTtc')::numeric AS amount_ttc,
  payload
FROM events
WHERE type = 'TransactionClassified'
ORDER BY occurred_at DESC;
```

Endpoint `GET /ledger/:account` → lignes filtrées par compte.

### Étape 5 — Optim `/rag/ask` via `lexa-reasoning` — 30 min

```
FROM qwen3.5:9b-optimized
PARAMETER num_ctx 8192
PARAMETER num_predict 600
SYSTEM """Tu es un assistant juridique fiscal suisse pour Lexa.
Tu reponds en prose naturelle mais cites TOUJOURS les articles de loi
(format: Art. XX LTVA, Art. XX LIFD).
Tu termines par: Information a titre indicatif - verifiez avec votre fiduciaire."""
```

Switch `MODEL_REASONING=lexa-reasoning` dans `.env` + restart.

### Étape 6 — Journal + commit + push — 30 min

---

## Scripts / assets sur le Spark (rappel)

### Services systemd Lexa
- `ollama.service` (stock + override.conf optimisé)
- `lexa-llama-embed.service` (llama-server BGE-M3 GPU port 8082)

### Scripts d'ingestion Lexa
Tous dans `~/ollama-compta/scripts/` (additifs, UUID4) :
- `ingest_lhid_lexa.py` (session 02)
- `ingest_afc_pdfs_lexa.py` (session 03)
- `ingest_vs_pdfs_lexa.py` (session 03)
- `ingest_lp_lexa.py` (session 04)
- `ingest_csi_lexa.py` (session 04)
- `ingest_vs_loi_fiscale_lexa.py` + `_v2.py` (session 04-05)
- `ingest_federal_ordonnances_lexa.py` (session 05)
- `ingest_afc_info_tva_lexa.py` (session 05)
- **`ingest_kafer_lexa.py` (session 07) — utilise llama-server 8082**

### Modelfiles Ollama
- `comptable-suisse` / `comptable-suisse-fast` (session 01, legacy fine-tuning)
- **`lexa-classifier` (session 07)** — base qwen3.5:9b-optimized, Käfer inline, JSON strict
- **À créer session 08** : `lexa-tva`, `lexa-reasoning`, puis `lexa-fiscal-pp`, `lexa-fiscal-pm`

### Binaires
- `~/llama.cpp/build/bin/llama-server` — built for sm_121a
- `~/llama.cpp/build/bin/llama-embedding` — CLI alternatif
- `~/models/bge-m3/bge-m3-Q8_0.gguf` — 606 MB

### Fichier legacy à cleaner
- `~/lexa-embed-service/` — Python FastAPI plus utilisé, peut être supprimé session 08

---

## État de la collection Qdrant `swiss_law`

**5388 points total** (session 07 +66 Käfer)

- **Fédéral lois** (5/5) : LIFD, LTVA, CO, LHID, LP — **1281 articles**
- **Fédéral ordonnances** (4/4) : OIFD, OLTVA, OIA, ORC — **448 articles**
- **Fédéral AFC** : Notice A + 14 circulaires IFD — **~1880 chunks**
- **Fédéral CSI** : Circ 28 + commentaire — **479 chunks**
- **Fédéral Info TVA** : TVA 12 + 15 + secteur 17 + secteur 04 — **652 chunks**
- **Cantonal VS** : Loi fiscale 339 articles + 4 guides/directives — **567 chunks**
- **Plan comptable Käfer** : 66 comptes structurés — **66 chunks** ✨ nouveau
- Total approximatif : 5373 + overhead = **5388**

---

## Avertissements importants

1. **deepseek-ocr est en prod** (autre projet user) → ne jamais décharger manuellement, ne jamais toucher
2. **lexa-llama-embed.service tourne via systemd** — pour restart : `sudo systemctl restart lexa-llama-embed`
3. **Backup Ollama config** : `/etc/systemd/system/ollama.service.d/override.conf.backup-20260414-134716` si besoin de rollback
4. **`think: false` par défaut** dans OllamaClient.ts → tous les futurs agents héritent
5. **UUID4 strict** pour tout nouvel upsert Qdrant (règle sacrée)
6. **Password Postgres lexa_app** dans `~/.lexa_db_pass_temp` sur Mac + `/home/swigs/lexa-backend/.env` (mode 600) sur .59
7. **Pas de secrets dans git**

---

## Vérification rapide en début de session 08

```bash
# 1. Backend up ?
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health | python3 -m json.tool'
# → ok: true, 5 services verts, ~5388 points

# 2. llama-server BGE-M3 up ?
ssh swigs@192.168.110.103 'systemctl is-active lexa-llama-embed; curl -s http://localhost:8082/health'
# → active, {"status":"ok"}

# 3. Ollama modèles ?
ssh swigs@192.168.110.103 'ollama ps'
# → deepseek-ocr + comptable-suisse-fast + lexa-classifier

# 4. Event store ?
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/transactions/stats/summary | python3 -m json.tool'
# → total: 6+, byType: {TransactionIngested: X, TransactionClassified: X}
```

---

## Contexte Claude (auto-surveillance)

Session 07 a été **très dense** (5h+ de travail, ~30 tool calls complexes, 2 subagents, plusieurs rebonds). Le contexte commence à se remplir — la session 09 devra probablement démarrer sur une instance fraîche qui lit simplement ce `NEXT-SESSION.md`. Session 08 est encore faisable dans cette instance.

**En cas de reprise sur instance fraîche** : ce document + le session-07.md + `plan_kafer.yaml` + le code backend suffisent à reprendre n'importe quel fil.

---

**Dernière mise à jour** : 2026-04-14 (fin session 07)
