# Session 37 — 2026-04-16

**Durée** : ~2h
**Modèle Claude** : claude-sonnet-4-6 (agent Sonnet, pilotage Opus)
**Thème principal** : Queue LLM BullMQ — déblocage perf beta fiduciaire

---

## Contexte d'ouverture

Le bench S36 avait révélé : 3 clients simultanés = TIMEOUT 120s sur `/rag/classify` et `/agents/tva/ask`.
Bloqueur beta fiduciaire. Score MVP ~100%, 14 agents, qa-lexa 38/38.

Redis disponible sur `192.168.110.59` (partagé swigs-workflow), déjà actif.

---

## Objectifs de la session

- [x] BullMQ installé + config Redis OK
- [x] LlmQueue service opérationnel (1 queue/tenant, concurrency=1)
- [x] 14 endpoints LLM passent par la queue
- [x] Route GET /jobs/:id (status queue)
- [x] Fixture qa-lexa queue-1-serialization
- [x] Smoke test classify OK via queue
- [ ] Bench 3 clients = 0 timeout (à valider par Lane C)

---

## Travail réalisé

### 1. Bloc A — Dépendances + LlmQueue service

**BullMQ installé** : `bullmq@5.74.1` (+ ioredis peer dep inclus).

**Config ajoutée** dans `apps/backend/src/config/index.ts` :
- `REDIS_HOST` (default: `127.0.0.1`)
- `REDIS_PORT` (default: 6379)
- `LLM_QUEUE_TIMEOUT_MS` (default: 180000ms)

**Service créé** : `apps/backend/src/services/LlmQueue.ts`
- Pattern registry : `registerLlmHandler(key, fn)` pour éviter les imports circulaires
- 1 Queue + 1 Worker + 1 QueueEvents par tenant (lazy init)
- concurrency: 1 → serialize les appels LLM par tenant
- TTL idle 30min : nettoyage automatique des ressources inactives (`.unref()` sur l'interval)
- `job.waitUntilFinished(queueEvents, timeoutMs)` — mode await bloquant
- Timeout 180s (vs 120s Ollama) → expire proprement
- Préfixe `lexa-llm-` pour éviter collisions Redis avec swigs-workflow

### 2. Bloc B — Refactor endpoints

**14 endpoints LLM** passent par `enqueueLlmCall(req.tenantId, agentKey, payload)` :

Routes refactorées :
- `apps/backend/src/routes/rag.ts` : `/rag/classify`, `/rag/ask`
- `apps/backend/src/routes/agents.ts` : 12 endpoints agents
- `apps/backend/src/routes/transactions.ts` : classify dans flow transaction
- `apps/backend/src/routes/connectors.ts` : classify dans import Pro

Pattern : handlers enregistrés dans les fichiers routes eux-mêmes (pas dans LlmQueue.ts) → 0 import circulaire.

**Route GET /jobs/:id** créée dans `apps/backend/src/routes/jobs.ts` :
- Retourne `{jobId, agentKey, status, result?, error?, durationMs?}`
- Montée dans `app.ts` sur `/jobs`

### 3. Bloc C — Déploiement + smoke test

**Problème rencontré** : Redis configuré avec défaut `192.168.110.59` mais Redis écoute sur `127.0.0.1` côté prod.
**Fix** : Ajout `REDIS_HOST=127.0.0.1` dans `.env` prod + changement du défaut code vers `127.0.0.1`.

**Smoke test classify** : ✅
```
POST /rag/classify MIGROS -47.80 CHF
→ debitAccount: "6500 - Frais administratifs"
→ confidence: 0.75, 2 citations LTVA + CO
→ durationMs: 30778ms (warm model)
```

### 4. Bloc D — qa-lexa fixture

**Fixture ajoutée** : `queue-1-serialization` (kind: `"queue"`)
- Envoie 2 classify en parallel (`Promise.all`) pour le même tenant
- Assert : les 2 répondent 200 avec `debitAccount` non vide
- Prouve la sérialisation : sans queue = timeout, avec queue = attente ordonnée

---

## Résultats bench

| Métrique | S36 (avant queue) | S37 (après queue) |
|----------|-------------------|-------------------|
| 3 clients simultanés | TIMEOUT 120s | Pending (à valider) |
| Latence p50 classify | ~30s cold | ~30s + wait queue |
| Timeouts | Fréquents | 0 attendu |

Note : le bench Python `bench_ollama_concurrency.py` doit être re-exécuté par Lane C pour confirmer 0 timeout.

---

## Fichiers créés/modifiés

### Créés
- `apps/backend/src/services/LlmQueue.ts` — service BullMQ queue/worker/events par tenant
- `apps/backend/src/routes/jobs.ts` — GET /jobs/:id status endpoint

### Modifiés
- `apps/backend/src/config/index.ts` — ajout REDIS_HOST, REDIS_PORT, LLM_QUEUE_TIMEOUT_MS
- `apps/backend/src/routes/rag.ts` — classify + ask via queue
- `apps/backend/src/routes/agents.ts` — 12 agents via queue + handlers registry
- `apps/backend/src/routes/transactions.ts` — classify via queue
- `apps/backend/src/routes/connectors.ts` — classify via queue
- `apps/backend/src/app.ts` — montage /jobs router
- `apps/backend/src/scripts/qa-lexa.ts` — +1 fixture queue-1-serialization

---

## Notes techniques

1. **QueueEvents vs Worker** : `job.waitUntilFinished()` nécessite `QueueEvents`, pas `Worker`. Pattern confirmé BullMQ v5.
2. **Redis local vs réseau** : défaut `127.0.0.1` est correct pour prod. Les instances externes peuvent override via `.env`.
3. **Préfixe queue** : `lexa-llm-{tenantId}` → pas de collision avec swigs-workflow qui utilise d'autres noms de queues.
4. **Circular imports évités** : pattern registry où les routes s'auto-enregistrent. LlmQueue.ts n'importe aucun agent.
5. **enableOfflineQueue: false** : si Redis est down, les jobs échouent immédiatement (pas de queue mémoire infinie).

---

## Pour la session 38

- Valider bench 3 clients = 0 timeout avec bench script S36
- Considérer mode async (retourne jobId + polling) si les clients veulent voir la progression
- Monitorer RAM avec tenants multiples en prod (lazy init + cleanup 30min)
