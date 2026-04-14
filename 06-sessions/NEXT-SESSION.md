# NEXT SESSION — Point de reprise

**Dernière session** : [Session 10 — 2026-04-14](2026-04-14-session-10.md)
**Prochaine session** : Session 11 — **Deploy frontend + validation pont Pro→Lexa live + polish UX + tests auto**

> **Lecture obligatoire au début de la prochaine session.**

---

## Bilan sessions 06-10 — Lexa MVP end-to-end fonctionnel

**Backend + frontend validés E2E** :
- 10 routes backend (health, rag, agents, transactions, ledger, connectors, onboarding)
- 3 agents IA (classifier 10s, reasoning 7.4s, **tva 6.9-10.6s** mesuré session 10)
- Event-sourcing + grand livre auto-balancé (14 events, 7 comptes, balance équilibrée CHF 13'103.80)
- Pont Swigs Pro → Lexa **ACTIF** (LEXA_ENABLED=true sur .59 depuis session 10)
- Frontend React 19 + Vite 8 + Tailwind 3.4 — 5 routes opérationnelles
- Onboarding wizard 4 étapes : **flow SWIGS SA validé de bout en bout** via chrome-devtools
- Dashboard / Ledger / Chat — tout le back rendu correctement côté UI

**Smoke tests session 10 (via chrome-devtools MCP)** :
- ✅ Home → /onboarding navigation
- ✅ CompanySearchField autocomplete "swigs" → "SWIGS SA" retourné ~300ms
- ✅ Click sur résultat hydrate tout le draft (name, UID, legalForm=sa, NPA, ville, canton VS, isVatSubject=true)
- ✅ Step 3 TVA pré-rempli en "Assujetti" (BFS retourne vatStatus=2)
- ✅ Step 4 Banque + IBAN CH93 0076 2011 6238 5295 7
- ✅ Click "Terminer" → POST /onboarding/company → redirect /dashboard
- ✅ Dashboard : 14 events, 7 comptes, CHF 13'103.80, Équilibrée, 4 services verts, 10 écritures colorisées
- ✅ Ledger : balance par compte + 14 écritures détaillées
- ✅ Chat TVA : "Taux TVA standard en Suisse ?" → réponse citant LTVA art. 25 en 6.9s avec 5 citations cliquables (liens fedlex)
- ✅ Chat TVA : "Repas affaires TVA déductible ?" → Art. 29 al. 2 LTVA en 10.6s

**Il reste à** : déployer le frontend sur .59, valider la boucle Pro→Lexa en live,
ajouter le webhook retour Lexa→Pro, tests automatisés, polish UX.

**Commit session 10** : `1609b42 feat(frontend): session 10 — React 19 + Vite + Tailwind scaffold + onboarding wizard`
— local, **non pushé**. À pousser en début session 11.

---

## Infrastructure actuelle

| Host | Service | Port | Status |
|---|---|---|---|
| **.59** | lexa-backend (Express TS) | 3010 | ✅ PM2, 10 routes |
| **.59** | Postgres 14.22 (base lexa) | 5432 | ✅ 3 migrations |
| **.59** | swigs-workflow | 3004 | ✅ PM2, **LEXA_ENABLED=true** |
| **.103** | Ollama (lexa-classifier/reasoning/tva) | 11434 | ✅ systemd |
| **.103** | llama-server BGE-M3 GPU | 8082 | ✅ systemd |
| **.103** | Qdrant (5388 pts) | 6333 | ✅ Docker |
| **local** | Frontend dev (Vite) | 5190 | dev only, pas encore deployé |

---

## Frontend — état actuel

Stack : React 19.2 + Vite 8.0 + TypeScript 6 + Tailwind 3.4 + Zustand + TanStack Query + react-router 7 + framer-motion + lucide-react.

```
apps/frontend/src/
├── main.tsx                 # QueryClient + Router + StrictMode
├── App.tsx                  # routes + RequireCompany guard
├── api/
│   ├── client.ts            # axios /api
│   ├── types.ts             # types miroirs backend
│   └── lexa.ts              # 11 méthodes typées
├── stores/
│   ├── companyStore.ts      # zustand persist localStorage
│   └── onboardingStore.ts
├── components/
│   ├── AppShell.tsx         # sidebar + NavLink
│   ├── StepIndicator.tsx
│   └── CompanySearchField.tsx   # debounced autocomplete BFS
└── routes/
    ├── Home.tsx             # landing
    ├── Onboarding.tsx       # wizard 4 steps
    ├── Dashboard.tsx        # stats + health + récents
    ├── Ledger.tsx           # balance + détail
    └── Chat.tsx             # 3 agents
```

**Commandes** :
```bash
cd apps/frontend
npm run dev      # → http://localhost:5190 (port strict)
npm run build    # → dist/ (465 KB JS, 16 KB CSS, gzip 150 KB)
npx tsc -b       # typecheck (clean)
```

Proxy Vite : `/api/*` → `http://192.168.110.59:3010/*` en dev.

---

## Plan session 11

### Étape 1 — Validation live du pont Pro→Lexa (15 min)

La prochaine récupération IMAP bankImapFetcher est prévue à :30 chaque heure.
Observer :

```bash
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 100 --nostream'
# Chercher : "POST /connectors/bank/ingest" en provenance de swigs-workflow
```

Si rien : forcer un fetch IMAP manuel ou pousser une transaction de test via curl
sur `/connectors/bank/ingest`.

### Étape 2 — Deploy frontend sur .59 (1h)

Options à trancher :
- **Path-based** : Nginx reverse proxy sur `/lexa/` (port 80/443), serve `dist/` statique
- **Port-based** : dédier le port 3011 ou 5190 au frontend via Nginx direct
- **Subdomain** : `lexa.swigs.local` ou `lexa.swigs.online` avec cert Let's Encrypt

Build + rsync + Nginx conf + test de bout en bout. Définir `VITE_LEXA_URL` à
l'URL publique du backend (ou proxy Nginx aussi vers :3010).

### Étape 3 — Webhook retour Lexa → Pro (45 min)

Quand Lexa classifie une transaction :
1. `POST http://.59:3004/api/lexa-callback` (nouveau endpoint dans swigs-workflow)
2. Mise à jour `BankTransaction.lexaClassification` (compte Käfer, TVA code, citations)
3. Idempotence via `eventId` (stream_id + version)

Nécessite :
- Nouveau hook dans `ClassifierAgent` → `notifyPro()`
- Flag `LEXA_CALLBACK_URL` côté Lexa backend (default off)
- Route `POST /api/lexa-callback` dans swigs-workflow
- Auth simple via HMAC shared secret

### Étape 4 — Tests automatisés (1h30 si temps)

- **qa-lexa** : fixture de 20 transactions → assert classification `account` + `tvaCode` matche l'attendu
- **perf-lexa** : p50/p95 sur /rag/ask, /agents/tva/ask, /transactions
- **corpus-validator** : top-K recall sur corpus de 50 questions juridiques

### Étape 5 — Polish UX frontend (si temps)

- Loading skeletons sur dashboard/ledger
- Empty states
- Toast notifications (react-hot-toast ?)
- Form validation zod dans onboarding
- i18n (FR seulement pour l'instant, mais structure i18next prête)

---

## Questions à trancher en début de session 11

1. **Push session 10 sur origin/main maintenant ?** — commit local `1609b42` à envoyer (ma reco : oui)
2. **Où déployer le frontend ?** (path, port, ou subdomain) — ma reco : subdomain `lexa.swigs.local` en dev, `lexa.swigs.online` en prod avec cert Let's Encrypt
3. **Ordre des étapes** — validation pont → tests automatisés → deploy ? Ou deploy d'abord pour démo ?
4. **Auth frontend** — multi-tenant JWT ou on reste single-tenant avec `companyStore` localStorage ?
5. **Canvas visuel (react-flow vs tldraw)** — toujours à benchmarker
6. **Webhook retour Pro** — HMAC auth ou basic shared secret dans header ?

---

## Dette technique identifiée en session 10 (à traiter en 11)

| Priorité | Item | Où | Effort |
|---|---|---|---|
| P1 | Vérifier que le pont Pro→Lexa a bien reçu une transaction (logs lexa-backend `POST /connectors/bank/ingest`) | .59 logs | 5 min |
| P2 | Warning a11y : "form field element should have an id or name attribute" | `StepBank` IBAN inputs, ajouter `id` / `name` | 5 min |
| P2 | Le `companyStore` persist est global — si plusieurs users testent sur le même browser, ils partagent. À isoler en session 11 si on ajoute l'auth. | `stores/companyStore.ts` | 15 min si JWT |
| P3 | Les `id`/`tenant_id` des writes ne sont pas filtrés côté UI — on affiche le tenant fixe `00000000-0000-0000-0000-000000000001` du seed. Quand on onboarde SWIGS, on crée un nouveau tenant mais le dashboard continue de fetcher le tenant par défaut. À corriger : passer `tenantId` dans les requêtes. | `api/client.ts` + routes backend | 30 min |
| P3 | Loading skeletons au lieu de "Chargement..." | Dashboard, Ledger | 20 min |
| P3 | Empty states élégants | Dashboard (écritures vides) | 10 min |
| P4 | Toast notifications (react-hot-toast) pour succès/erreurs onboarding | global | 15 min |
| P4 | Form validation Zod dans onboarding | `routes/Onboarding.tsx` | 30 min |
| P4 | i18n (fr-CH seulement mais structure i18next prête) | global | 1h |

**Note importante sur P3 "tenant isolation"** : actuellement le backend `GET /ledger`, `/transactions/stats/summary`, etc. retournent TOUJOURS les données du tenant `00000000-0000-0000-0000-000000000001` (le seed). Quand on a onboardé SWIGS SA en session 10, la company a été créée avec un nouveau `tenant_id` persisté dans `companyStore`, mais le dashboard continue de montrer les 14 events du tenant seed. **Pour une vraie UX multi-tenant il faut** : (a) passer `tenant_id` en header ou query param aux requêtes backend, (b) côté backend, lire ce tenant et filter. À trancher : est-ce session 11 ou plus tard ?

---

## Vérification rapide début session 11

```bash
# Backend health
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health | python3 -m json.tool'

# Pont actif ?
ssh swigs@192.168.110.59 'grep -E "^LEXA_" /home/swigs/swigs-workflow/.env'

# Classifications récentes côté Lexa
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/transactions/stats/summary'

# Frontend build local
cd ~/CascadeProjects/lexa/apps/frontend && npx tsc -b && npm run build
```

---

## Avertissements importants

1. **Frontend PAS encore déployé** — tout est local, dev server sur port 5190 strict
2. **Pont Pro→Lexa ACTIF en prod** depuis session 10 — à surveiller pour éviter surcharge backend
3. **`companyStore` en localStorage** — pas de vraie auth, multi-tenant non géré
4. **Pas de tests automatisés** encore — validation manuelle uniquement
5. **Sudo .59** : `Labo`, sudo Spark : `SW45id-445-332`, password Postgres : `~/.lexa_db_pass_temp`
6. **Backend Lexa** commit `63db503` (main). Pas de nouveau commit côté backend en session 10.
7. **Frontend** pas encore committé — à faire au début session 11 ou fin session 10 sur demande user.

---

## Points ouverts (dette)

- [ ] Deploy frontend .59
- [ ] Webhook retour Lexa→Pro
- [ ] Tests automatisés (qa, perf, corpus)
- [ ] Modelfile `lexa-fiscal-pp` (déclaration PP Valais)
- [ ] Canvas visuel flow (react-flow/tldraw benchmark)
- [ ] i18next multi-langue
- [ ] Auth multi-tenant frontend
- [ ] Commit frontend (pas encore fait — à trancher avec user)

---

## Quick-start session 11 (copier-coller)

```bash
# 1. Sync repo
cd ~/CascadeProjects/lexa
git log --oneline -3   # vérifier qu'on est sur 1609b42
git push origin main   # (après confirmation user)

# 2. Vérifier que rien n'a bougé côté backend + pont
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health; echo; grep -E "^LEXA_" /home/swigs/swigs-workflow/.env'
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 200 --nostream | grep -i "ingest\|classifier\|lexa-pro"'

# 3. Relancer dev frontend
cd apps/frontend && npm run dev   # → http://localhost:5190

# 4. Fix rapide dette P2 a11y (AVANT le deploy) : ajouter id/name aux inputs
# Fichier : src/routes/Onboarding.tsx StepBank
```

---

**Dernière mise à jour** : 2026-04-14 (fin session 10, après smoke tests chrome-devtools + commit)
