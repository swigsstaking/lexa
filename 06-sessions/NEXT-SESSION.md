# NEXT SESSION — Point de reprise

**Dernière session** : [Session 11 — 2026-04-14](2026-04-14-session-11.md)
**Prochaine session** : Session 12 — **Deploy frontend + webhook retour + tests auto + code-splitting**

> Le pivot UX whitepaper est **terminé** (session 11). Session 12 = remettre en prod + fermer les derniers gaps opérationnels.

---

## État stable à emporter

| Couche | État | Notes |
|---|---|---|
| 1. Knowledge | ✅ 5388 pts Qdrant | stable |
| 2. Data | ✅ event store + grand livre + **multi-tenant middleware** | req.tenantId partout |
| 3. Reasoning | ✅ 3 agents (classifier 10s, reasoning 7.4s, tva 6.9-10.6s) | stable |
| 4. Execution | ❌ | templates déclaratifs à venir |
| 5. Interface | ✅ **alignée whitepaper** | workspace canvas + chat cmd+k + timeline + dark mode |

**Backend routes (11)** :
```
GET  /health
POST /rag/ask, /rag/classify
POST /agents/tva/ask
GET  /agents
POST /transactions, GET /transactions/:streamId, /transactions/stats/summary
GET  /ledger, /ledger/account/:a, /ledger/balance, POST /ledger/refresh
POST /connectors/bank/ingest, GET /connectors/bank/formats
GET  /onboarding/company/search
POST /onboarding/company
GET  /onboarding/company/:tenantId
PATCH /onboarding/company/:tenantId
```
Toutes les GETs tenant-aware lisent `req.tenantId` (header `X-Tenant-Id` → query `tenantId` → DEFAULT).

**Frontend routes (3)** :
```
/             → Home (landing, redirect /workspace si activeCompany)
/onboarding   → Wizard 4 steps
/workspace    → Canvas hero + ChatOverlay cmd+k + Timeline + LedgerModal toggle (protégé)
```

**Stack frontend** :
- React 19.2 + Vite 8 + TS 6 strict
- Tailwind 3.4 darkMode class + CSS variables sémantiques
- @xyflow/react 12 pour le canvas
- Zustand (`companiesStore` pluriel persist, `chatStore` non-persist, `onboardingStore` éphémère)
- TanStack Query 5 (staleTime 30s)
- framer-motion, lucide-react
- i18next + react-i18next, `fr.json` seul

**Build** : 700 KB JS (225 KB gzip), 40 KB CSS (7.5 KB gzip), build 880 ms.

---

## Infrastructure actuelle

| Host | Service | Port | Status |
|---|---|---|---|
| **.59** | lexa-backend (Express TS + tsx watch) | 3010 | ✅ PM2, tenant middleware actif |
| **.59** | Postgres 14.22 (base lexa) | 5432 | ✅ 3 migrations |
| **.59** | swigs-workflow | 3004 | ✅ PM2, LEXA_ENABLED=true, **mapping eCH-0097 corrigé** |
| **.103** | Ollama (lexa-classifier/reasoning/tva) | 11434 | ✅ systemd |
| **.103** | llama-server BGE-M3 GPU | 8082 | ✅ systemd |
| **.103** | Qdrant (5388 pts) | 6333 | ✅ Docker |
| **local** | Frontend dev (Vite) | 5190 | **pas encore deployé** |

---

## Plan session 12

### Étape 1 — Validation live du pont Pro→Lexa (15 min)

Le cron IMAP de swigs-workflow tourne toutes les heures à :30. Depuis
l'activation `LEXA_ENABLED=true` en session 10, aucun log de POST
`/connectors/bank/ingest` n'est encore apparu — soit parce qu'aucune transaction
n'a été récupérée, soit parce que le cron n'a pas tourné au moment où j'ai
regardé.

```bash
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 500 --nostream 2>&1 | grep -iE "connectors/bank|ingest"'
```

Si toujours rien, forcer manuellement un `fetchBankEmails()` côté swigs-workflow
via un endpoint debug ou via la shell MongoDB pour simuler une nouvelle
transaction → vérifier que le POST sort bien.

### Étape 2 — Deploy frontend sur .59 (1h30)

**Option A — Subdomain `lexa.swigs.online`** (reco)
- DNS : A record `lexa.swigs.online` → IP publique .59
- Nginx : nouveau vhost sur port 80/443 avec cert Let's Encrypt (certbot)
- rsync `dist/` sur `.59:/home/swigs/lexa-frontend/dist/`
- Nginx sert statique + proxy `/api` → `localhost:3010` (ou laisser CORS via `X-Tenant-Id` header déjà en place)
- `VITE_LEXA_URL=/api` en production (pareil que dev)

**Option B — Path `/lexa/` sur un vhost existant** (plus simple mais moins propre)
- `location /lexa { alias /home/swigs/lexa-frontend/dist; try_files $uri /index.html; }`
- `location /lexa/api { proxy_pass http://localhost:3010; }`
- `base` dans `vite.config.ts` → `/lexa/`

**Option C — Port dédié 3011** (dev simple)
- Serveur Express minimal servant `dist/` sur `3011`
- Pas de TLS, usage interne only

**Ma reco** : A si domaine public voulu, sinon B pour aller vite.

### Étape 3 — Webhook retour Lexa → Pro (1h)

Quand Lexa classifie (event `TransactionClassified`), notifier swigs-workflow
pour updater `BankTransaction.lexaClassification` :

- Nouveau flag `LEXA_CALLBACK_URL=http://localhost:3004/api/lexa-callback` dans `.env` Lexa backend
- Dans `ClassifierAgent` : fire-and-forget HTTP POST après classification réussie
- Auth : HMAC SHA-256 shared secret header `X-Lexa-Signature`
- Nouveau endpoint `POST /api/lexa-callback` dans swigs-workflow :
  - Vérifier signature HMAC
  - Match `BankTransaction` par `streamId` stocké dans `metadata`
  - Update `lexaClassification: { account, tvaCode, tvaRate, confidence, citations }`
- Pattern identique au hook Pro→Lexa : **jamais throw**, logs en cas d'erreur

### Étape 4 — Code-splitting Vite (30 min)

Build actuel 700 KB, warning 500 KB. Plan :

```tsx
// App.tsx
const Onboarding = lazy(() => import('@/routes/Onboarding'));
const Workspace = lazy(() => import('@/routes/Workspace'));

// Workspace.tsx
const LedgerModal = lazy(() => import('@/components/ledger/LedgerModal'));
```

Objectif : descendre la route principale sous 200 KB gzippé, le canvas
chargé uniquement après onboarding.

### Étape 5 — Tests automatisés (2h)

- **`scripts/qa-lexa.ts`** : fixture de 20 transactions Pro (Migros, Fiduciaire,
  Loyer, CFF, Achat hardware, etc.) → POST `/connectors/bank/ingest?classify=true`
  → assert `account` matche attendu, `tvaCode` correct, `confidence > 0.7`.
  Output : rapport markdown + JSON.
- **`scripts/perf-lexa.ts`** : 50 requêtes en série sur `/rag/ask`, `/agents/tva/ask`,
  `/transactions`. Mesurer p50/p95/p99. Targets : p50 < 10s, p95 < 20s.
- **`scripts/corpus-validator.ts`** : 50 questions juridiques avec l'article
  attendu → embedding BGE-M3 → Qdrant top-3 → assert article dans les 3 premiers
  (recall@3). Target > 90%.

Intégration : GitHub Actions déclenché manuellement sur tag ou push main.

### Étape 6 — Polish UX (si temps)

- Layout canvas : remplacer grid 4-col naïf par `elkjs` (elkAlgorithm `layered`)
  pour un vrai dagre-like layout
- Loading skeletons quand `balance.isLoading` / `entries.isLoading`
- Empty state quand canvas vide (tenant neuf comme Kozelsky) : "Aucune
  transaction. Envoyez-en une via Swigs Pro ou `/connectors/bank/ingest`."
- Toasts notifications (reco : `sonner` en remplacement de `react-hot-toast`)
- Animation entrée/sortie des nodes quand une nouvelle transaction tombe

### Étape 7 — Commit + journal session 12 (30 min)

---

## Questions à trancher début session 12

1. **Deploy frontend : sous-domaine `lexa.swigs.online` avec cert Let's Encrypt (reco), path `/lexa/`, ou port interne 3011 ?**
2. **Webhook retour : HMAC SHA-256 shared secret (reco), ou auth JWT partagée avec Swigs Hub v2 ?**
3. **Tests automatisés : session 12 entière, ou juste qa-lexa et reporter perf/corpus ?**
4. **Layout canvas : elkjs maintenant ou grid naïf suffit pour session 12 ?**
5. **Briefing quotidien agent conseiller : session 12 ou 13 ?**

---

## Dette technique à traiter

| Priorité | Item | Effort |
|---|---|---|
| P1 | Code-splitting (700 KB → < 500 KB) | 30 min |
| P1 | Layout canvas elkjs (vs grid naïf) | 45 min |
| P2 | Empty state canvas quand tenant neuf | 15 min |
| P2 | Loading skeletons dashboard/ledger | 30 min |
| P2 | SSO Swigs Hub v2 (remplacer localStorage naïf) | 2h |
| P3 | Toasts + form validation Zod onboarding | 45 min |
| P3 | Gestion backend des POST `/ledger/refresh`, `/rag/classify` côté tenant | déjà OK |
| P4 | Animation live canvas quand nouvelle transaction ingérée | 1h |
| P4 | Dark mode toggle (actuellement forced dark — ajouter preference `.light`) | 20 min |

---

## Commits session 11 (local, non pushés)

Repo `lexa/` branche `main`, 4 commits restent d'avant + les nouveaux de session 11 :
```
(session 11) feat(frontend+backend): session 11 — pivot whitepaper (canvas + dark + multi-tenant + i18n + cmd+k)
(session 11) fix(onboarding): return a full Company shape with id/tenantId from POST
5647848 docs(session-10): update NEXT-SESSION with smoke test results + dette P1-P4
1609b42 feat(frontend): session 10 — React 19 + Vite + Tailwind scaffold
48a9afc docs(session-11): refactor brief
74b7b47 fix(companyLookup): eCH-0097 legal form mapping
```

Repo `swigs-workflow/` branche `v2-refresh` :
```
5cc5b8c fix(companyLookup): align eCH-0097 legal form mapping with BFS V5 reality
98b6c1b feat(bridge): non-blocking hook to push bank transactions to Lexa
```

**À pousser début session 12** (après confirmation user).

---

## Quick-start session 12

```bash
# 1. Sync repos
cd ~/CascadeProjects/lexa
git log --oneline -8   # vérifier commits session 11
git push origin main   # (après confirmation)

cd ~/CascadeProjects/swigs-workflow
git log --oneline -3
git push origin v2-refresh   # (après confirmation)

# 2. Vérifier backend + pont
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health'
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 200 --nostream | grep -iE "ingest|connectors/bank"'

# 3. Rebuild frontend pour deploy
cd apps/frontend && npm run build && ls -lh dist/assets/

# 4. Attaquer étape 1 (validation pont) puis étape 2 (deploy)
```

---

## Avertissements importants

1. **Session 11 n'a pas encore été committée** dans le repo lexa (les fichiers modifiés attendent le commit final). Le commit est prévu dans la foulée par l'instance qui a fait le refactor. Si tu lis ça sur une instance fraîche, `git status` pour voir l'état.
2. **Le bug shape Company `/onboarding/company` POST est corrigé** — mais si tu testes avec un vieil localStorage `lexa.companies` sans `tenantId` dans les Company, vide-le.
3. **La persistence localStorage utilise `lexa.companies`** (pluriel) — l'ancienne clé `lexa.company` (singulier) est abandonnée.
4. **Multi-tenant middleware backend** : toutes les GET tenant-aware utilisent maintenant `req.tenantId` au lieu de hardcoded seed. Si tu rajoutes une route, pense au tenant.
5. **Dark mode forcé** : `<html class="dark">`. Pour ajouter un toggle, retirer `class="dark"` de `index.html` et ajouter un state dans un thème store + CSS fallback `.light`.
6. **Sudo .59** : `Labo`, sudo Spark : `SW45id-445-332`, password Postgres : `~/.lexa_db_pass_temp`.

---

**Dernière mise à jour** : 2026-04-14 (fin session 11)
