# NEXT SESSION — Point de reprise

**Dernière session** : [Session 06 — 2026-04-14](2026-04-14-session-06.md)
**Prochaine session** : Session 07 — Classifier JSON + event flow end-to-end

> **Lecture obligatoire au début de la prochaine session.**

---

## Où on en est

**Phase** : **1 — Scaffold backend opérationnel** ✓

Le premier jalon technique est atteint : **backend Lexa en production sur .59:3010**, 5 services verts (Postgres, Qdrant, Ollama, BGE-M3, Express), pipeline RAG validé end-to-end.

**Progrès cumulés sessions 01-06** :

| Session | Livrables clés | Qdrant | Code |
|---|---|---|---|
| 01 | Whitepaper, archi, roadmap | 791 | — |
| 02 | LHID + Git init | 899 | — |
| 03 | 15 AFC + 4 VS docs | 3007 | — |
| 04 | LP + CSI 28 + Loi VS Playwright | 4058 | — |
| 05 | Postgres, VS fix, ordonnances, Info TVA JSF | 5322 | — |
| 06 | **Backend scaffold + RAG pipeline end-to-end** | 5322 | ~800 lignes TS |

**Collection Qdrant `swiss_law`** : 5322 points (inchangé session 06).

---

## Infrastructure actuelle

| Machine | Service | Status | Port |
|---|---|---|---|
| **.59** | Lexa backend Express | ✅ PM2 online | 3010 |
| **.59** | Postgres 14.22 (base `lexa`) | ✅ | 5432 |
| **.59** | MongoDB | ✅ (pas encore utilisé par Lexa) | 27017 |
| **.59** | Redis | ✅ (pas encore utilisé) | 6379 |
| **.103** | Ollama (11 modèles dont `comptable-suisse*`) | ✅ | 11434 |
| **.103** | Qdrant (swiss_law 5322 pts) | ✅ | 6333 |
| **.103** | **BGE-M3 micro-service** (nohup uvicorn) | ✅ | **8001** |
| GitHub | [swigsstaking/lexa](https://github.com/swigsstaking/lexa) | ✅ | — |

---

## Ce qu'il faut lire AVANT de démarrer la session 07

1. **`06-sessions/2026-04-14-session-06.md`** — journal complet (15 min) — **essentiel**
2. **`apps/backend/src/`** — parcourir les fichiers TS (10 min) :
   - `app.ts`, `config/index.ts`
   - `db/postgres.ts`, `db/migrate.ts`, `events/EventStore.ts`
   - `rag/ragQuery.ts`, `agents/classifier/ClassifierAgent.ts`
3. **`apps/backend/src/db/migrations/001_events.sql`** — schema event store (3 min)

**Total : ~30 min**

---

## Questions en attente de réponse du user

⚠️ **5 questions à trancher en début de session 07** :

1. **Classifier JSON output** — priorité #1. Options :
   - (a) Modelfile `lexa-classifier` avec SYSTEM custom JSON + `/no_think`
   - (b) Parser prose avec regex tolérants
   - (c) Fine-tuning léger sur qwen3.5:9b avec dataset JSON
   - *Reco Claude : (a) + (b) comme fallback. (c) sera en session 08+*

2. **Systemd pour BGE-M3** — remplacer nohup par un service systemd propre ?
   - *Reco Claude : oui, 10 min de setup*

3. **Plan comptable Käfer structuré** — priorité ?
   - *Reco Claude : session 07 (rapide, utile pour le Classifier)*

4. **CAMT.053 parser** — premier connecteur bancaire pour tester le flow event-sourced end-to-end. Ou on laisse à session 08 ?
   - *Reco Claude : session 07 après le Classifier, c'est le test ultime du pipeline*

5. **Frontend** — démarrage session 08 ou plus tard ?
   - *Reco Claude : session 10+ après que 3-4 agents backend soient en production*

---

## Plan détaillé de la session 07

### Étape 1 — Créer Modelfile `lexa-classifier` sur le Spark (45 min)

```bash
ssh swigs@192.168.110.103
cat > ~/ollama-compta/Modelfile-lexa-classifier << 'EOF'
FROM qwen3.5:9b-optimized

PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER num_ctx 16384
PARAMETER num_predict 400
PARAMETER repeat_penalty 1.1

SYSTEM """Tu es un agent de classification comptable suisse pour le logiciel Lexa.
Tu classifies les transactions bancaires selon le plan comptable PME suisse (Kafer).

Tu reponds UNIQUEMENT avec un JSON valide, sans markdown, sans prose, sans commentaires.
Pas de <think> balises.

Format JSON strict:
{
  "debit_account": "XXXX - Nom",
  "credit_account": "YYYY - Nom",
  "tva_rate": 8.1,
  "confidence": 0.85,
  "reasoning": "courte explication (max 200 chars)",
  "citations": [{"law": "LTVA", "article": "Art. 25"}]
}
"""
EOF

ollama create lexa-classifier -f ~/ollama-compta/Modelfile-lexa-classifier
ollama run lexa-classifier "Classifie: Loyer bureau 2800 CHF"
```

Tester quelques prompts pour valider le JSON output.

### Étape 2 — Update backend pour utiliser lexa-classifier (15 min)

```typescript
// .env.example et .env
MODEL_CLASSIFIER=lexa-classifier
```

```bash
ssh swigs@192.168.110.59 'cd /home/swigs/lexa-backend && pm2 restart lexa-backend'
```

### Étape 3 — Test Classifier end-to-end avec JSON parsing (30 min)

```bash
ssh swigs@192.168.110.59 'cd /home/swigs/lexa-backend && npm run test:classify'
```

Attendus : 1-5 transactions classifiées avec JSON parsé, comptes Käfer corrects, citations LTVA/LIFD.

### Étape 4 — Plan comptable Käfer structuré (30 min)

```yaml
# ~/ollama-compta/plan_comptable_kafer.yaml
accounts:
  - id: "1000"
    label: "Caisse"
    class: 1
    type: "balance_sheet_asset"
  - id: "1020"
    label: "Banque - compte courant"
    class: 1
  ...
```

Script d'ingestion Python → Qdrant avec `topic: "plan_comptable_kafer"`.

### Étape 5 — Flow event-sourced end-to-end (1h30)

Nouveau endpoint `POST /transactions` :
1. Reçoit une transaction bancaire
2. Écrit un event `TransactionIngested` dans l'event store
3. Appelle ClassifierAgent
4. Écrit un event `TransactionClassified` lié
5. Retourne la classification + le stream_id

Test via curl :
```bash
curl -X POST http://192.168.110.59:3010/transactions \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-04-14","description":"LOYER BUREAU","amount":-2800,"currency":"CHF"}'
```

Query l'event store pour vérifier les events persistés.

### Étape 6 — Systemd pour BGE-M3 (15 min)

```bash
sudo tee /etc/systemd/system/lexa-embed.service << 'EOF'
[Unit]
Description=Lexa BGE-M3 Embedding Service
After=network.target

[Service]
Type=simple
User=swigs
WorkingDirectory=/home/swigs/lexa-embed-service
Environment="PYTHONPATH=/home/swigs/.local/lib/python3.12/site-packages"
ExecStart=/home/swigs/.local/bin/uvicorn app:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now lexa-embed.service
```

**Attention** : besoin du sudo password `Labo` sur le Spark aussi (à tester, peut-être différent de .59).

### Étape 7 — (optionnel) CAMT.053 parser (2h)

Parser XML ISO 20022 CAMT.053 basique → transactions → POST /transactions en boucle.

### Étape 8 — Journal + commit + push (30 min)

---

## État du code backend

```
apps/backend/
├── package.json            ✓ Node 20+, TypeScript strict, 113 packages
├── tsconfig.json           ✓ ES2022, Bundler, strict, 0 erreurs
├── .env.example            ✓
├── .gitignore              ✓
└── src/
    ├── app.ts              ✓ Express + graceful shutdown
    ├── config/index.ts     ✓ Zod config
    ├── db/
    │   ├── postgres.ts     ✓
    │   ├── migrate.ts      ✓ Migration runner
    │   └── migrations/001_events.sql  ✓ events + ai_decisions tables
    ├── events/
    │   ├── types.ts        ✓ LexaEvent types
    │   └── EventStore.ts   ✓ append/read/readByType/count
    ├── rag/
    │   ├── EmbedderClient.ts  ✓ BGE-M3 HTTP client
    │   ├── QdrantClient.ts    ✓
    │   └── ragQuery.ts        ✓ Pipeline complet VALIDÉ
    ├── llm/
    │   └── OllamaClient.ts ✓ timeout 900s, format:"json" support
    ├── agents/classifier/
    │   └── ClassifierAgent.ts  ⚠️ scaffold OK, prompt tuning WIP
    ├── routes/
    │   ├── health.ts       ✓ /health — 5 services verts
    │   └── rag.ts          ✓ /rag/ask VALIDÉ, /rag/classify WIP
    └── scripts/
        └── test-classify.ts  ✓ (1 transaction pour debug)
```

---

## Tests effectués session 06 (reproductibles)

```bash
# 1. Health
curl http://192.168.110.59:3010/health
# => 5 services verts, 5322 points Qdrant

# 2. RAG ask (VALIDÉ)
curl -X POST http://192.168.110.59:3010/rag/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Quel est le seuil assujettissement TVA?","topK":3}'
# => Réponse correcte + 3 citations, 797s (lent mais OK)

# 3. Classify (WIP)
curl -X POST http://192.168.110.59:3010/rag/classify \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-04-14","description":"LOYER BUREAU","amount":-2800,"currency":"CHF"}'
# => pipeline OK mais JSON parsing échoue (à fixer session 07)
```

---

## Scripts Spark disponibles (KB session 01-05)

Voir `06-sessions/2026-04-14-session-05.md` pour la liste complète. 11 scripts d'ingestion, tous `ingest_*_lexa.py`, additifs avec UUID4.

---

## Avertissements importants

1. **Ne jamais redémarrer le Spark sans prévenir** — il héberge 3 modèles Ollama en prod pour d'autres projets du user.
2. **BGE-M3 micro-service tourne en nohup** — survit à la déconnexion SSH mais pas à un reboot. Priorité systemd session 07.
3. **`comptable-suisse-fast` a un SYSTEM prompt énorme** — ne pas l'utiliser pour le Classifier, utiliser un Modelfile dédié.
4. **Ollama `format:"json"` bug avec Qwen3 thinking** — workaround à définir session 07.
5. **Postgres password `lexa_app`** dans `.env` mode 600 sur .59, et dans `~/.lexa_db_pass_temp` sur Mac. JAMAIS commit.
6. **BGE-M3 en CPU sur Spark** — torch+CUDA indispo aarch64. Pas bloquant mais lent.
7. **Pas de secrets dans git**, point final.

---

## Backend en prod

**Vérifier à chaque début de session** :
```bash
ssh swigs@192.168.110.59 'pm2 list | grep lexa-backend; curl -s http://localhost:3010/health | python3 -m json.tool'
```

Si backend down :
```bash
ssh swigs@192.168.110.59 'cd /home/swigs/lexa-backend && pm2 restart lexa-backend && sleep 3 && pm2 logs lexa-backend --lines 20 --nostream'
```

Si BGE-M3 down :
```bash
ssh swigs@192.168.110.103 'curl -s http://localhost:8001/health || (nohup /home/swigs/.local/bin/uvicorn app:app --host 0.0.0.0 --port 8001 --app-dir /home/swigs/lexa-embed-service > /tmp/lexa-embed.log 2>&1 &)'
```

---

**Dernière mise à jour** : 2026-04-14 (fin session 06)
