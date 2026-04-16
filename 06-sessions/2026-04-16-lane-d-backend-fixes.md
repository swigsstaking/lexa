# Lane D — Backend Fixes (2026-04-16)

## Contexte

Fixes backend post-audit E2E Lane C S37. 3 bugs résolus.

---

## BUG-P2-01 — Upload OCR 502 Bad Gateway

**Statut : résolu par stabilisation S37 (transitoire)**

Test upload POST /documents/upload avec fixture `test-cert-salaire.pdf` → HTTP 201 + ocrResult complet (1000+ chars rawText). Aucune action nginx requise.

Fixture qa-lexa `fix-p2-01-ocr-upload-healthcheck` ajoutée pour détecter régressions futures.

---

## BUG-P1-01 — Cache HTTP 304 fuite session (partie backend)

**Statut : corrigé**

### Fichiers créés/modifiés

- `apps/backend/src/middleware/noCache.ts` (nouveau)
- `apps/backend/src/app.ts` — pattern matcher global

### Preuve curl

```
cache-control: no-store, no-cache, must-revalidate, private
pragma: no-cache
expires: 0
```

Routes couvertes : `/fiduciary`, `/taxpayers`, `/companies`, `/audit`, `/documents`, `/ledger`, `/forms`, `/agents`, `/rag`, `/simulate`, `/jobs`.

Routes publiques (`/health`, `/auth`, `/onboarding`) non affectées.

---

## BUG-P3-01 — Agent Clôture timeout sans HTTP 504

**Statut : corrigé**

### Fichiers créés/modifiés

- `apps/backend/src/services/LlmQueue.ts` — `LlmQueueTimeoutError` class + wrap `waitUntilFinished`
- `apps/backend/src/routes/_llmErrorHandler.ts` (nouveau) — helper `handleLlmError`
- `apps/backend/src/routes/agents.ts` — 12 endpoints refactorés
- `apps/backend/src/routes/rag.ts` — 2 endpoints refactorés (`/ask`, `/classify`)

### Mapping erreurs → HTTP

| Erreur | HTTP | body.error |
|--------|------|------------|
| `LlmQueueTimeoutError` | 504 | `agent_timeout` |
| ECONNREFUSED / Ollama down | 502 | `agent_unavailable` |
| Autre | 500 | `agent_failed` |

Note : `simulate.ts` laissé en 500 brut (pas de LLM — calculs purs TaxSimulator).

---

## qa-lexa

2 nouvelles fixtures :
- `fix-p1-01-cache-headers` — GET /fiduciary/clients → assert Cache-Control contient "no-store"
- `fix-p2-01-ocr-upload-healthcheck` — POST /documents/upload → assert HTTP 201 + ocrResult

BUG-P3-01 : pas de fixture automatique (timeout artificiel trop invasif — dette documentée).

---

## Déploiement

```
rsync apps/backend/src/ → swigs@192.168.110.59:/home/swigs/lexa-backend/src/
pm2 restart lexa-backend
```

Backend online, 0 crash.
