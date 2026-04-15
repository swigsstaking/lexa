# NEXT SESSION — Point de reprise

**Dernière session** : [Session 13 — 2026-04-15](2026-04-15-session-13.md)
**Prochaine session** : Session 14 — **Enablers plateforme : auth + deploy + classifier auto pont**

> Session 13 a donné de la profondeur à l'Execution layer (4 formulaires
> officiels, 4 agents IA, idempotence mutualisée, qa-lexa de régression).
> Session 14 doit poser les enablers qui manquent pour ouvrir Lexa à un
> testeur externe : **auth JWT simple**, **deploy frontend prod**, et
> **classification automatique** sur le pont Pro→Lexa.

---

## Ce qui marche après session 13

| Composant | État |
|---|---|
| **Execution layer — formulaires** | |
| `POST /forms/tva-decompte` (trimestriel effectif + TDFN) | ✅ idempotent |
| `POST /forms/tva-decompte-annuel` (art. 72 LTVA) | ✅ idempotent |
| `POST /forms/vs-declaration-pp` (Valais PP 2024) | ✅ idempotent PDF |
| `GET /forms/tdfn-rates` | ✅ 21 secteurs |
| Helper `finalizeForm` mutualisé + idempotence par formKind | ✅ |
| **Reasoning — agents** | |
| `POST /rag/classify` (lexa-classifier) | ✅ ~30s |
| `POST /rag/ask` (lexa-reasoning) | ✅ ~9s |
| `POST /agents/tva/ask` (lexa-tva) | ✅ ~9s |
| `POST /agents/fiscal-pp/ask` (lexa-fiscal-pp-vs, 4e modèle) | ✅ ~13.4s |
| `GET /agents` listing | ✅ 4 agents actifs + 5 planned |
| **Tests auto** | |
| `qa-lexa` script 10 fixtures | ✅ 10/10 pass baseline |
| **Frontend** | |
| Toggle Trimestriel/Annuel + select secteur TDFN + bouton VS-PP | ✅ compile clean, smoke UI à revalider au prochain `npm run dev` |
| Double download blob (PDF + XML) avec toast idempotent | ✅ |
| **Infra** | |
| `EMBEDDER_URL` fixé sur `:8082` (llama-server OpenAI compat) | ✅ |
| RAG restauré end-to-end | ✅ 5 citations par query |

---

## Priorité session 14 — enablers plateforme

### A. Auth JWT simple (~2h)

Décision tranchée #6 session 11, toujours valide.

1. **Backend** `apps/backend/src/auth/`
   - Migration `004_users.sql` : table `users` avec `id`, `email`, `password_hash`
     (bcrypt), `created_at`, `tenant_ids[]` (pour fiduciaire mode multi-clients)
   - `POST /auth/register` body `{email, password}` → user + tenant auto-créé
   - `POST /auth/login` body `{email, password}` → retourne JWT signé HS256
     (secret dans `.env` `JWT_SECRET`)
   - Middleware `requireAuth` qui vérifie le JWT et injecte `req.userId`
   - Le middleware `tenantMiddleware` existant continue de lire
     `X-Tenant-Id`, mais ajoute un check que `tenantId ∈ user.tenant_ids`
2. **Frontend** `apps/frontend/src/auth/`
   - Store zustand `authStore` persistant localStorage (`lexa.auth`)
     avec `{token, userId, expiresAt}`
   - `routes/Login.tsx` : page simple email + password + bouton submit
   - Axios interceptor : injecte `Authorization: Bearer ${token}` sur
     toutes les requêtes, redirect `/login` sur 401
   - `RequireAuth` wrapper pour `/workspace` et `/onboarding`
3. **Smoke test** : register nouvel user → login → JWT reçu → appel
   `/ledger/balance` autorisé, appel sans token → 401

Pas de SSO Swigs Hub, pas de TOTP, pas de refresh token — reporté session 15+.

### B. Deploy frontend prod `lexa.swigs.online` (~1h)

1. `cd apps/frontend && npm run build` → `dist/`
2. `rsync dist/` vers `.59:/var/www/lexa.swigs.online/`
3. Config nginx `/etc/nginx/sites-available/lexa.swigs.online` :
   - `server_name lexa.swigs.online`
   - Root `/var/www/lexa.swigs.online`
   - Try_files `$uri $uri/ /index.html` pour React router
   - Proxy `/api/` → `http://localhost:3010/` (strip `/api` prefix)
   - Headers CORS hérités (déjà dans backend)
4. Let's Encrypt : `certbot --nginx -d lexa.swigs.online`
5. Reload nginx + smoke test HTTPS

**À coupler avec l'auth JWT** : un frontend public sans auth serait un
risque. Si bloqué sur l'auth, reporter le deploy d'une session.

### C. Classification auto sur pont Pro→Lexa (~1h)

Actuellement le cron IMAP `:30` de swigs-workflow POST `/connectors/bank/ingest`
avec `classify: false`, donc les transactions arrivent dans le grand livre
**sans classification**. Activer :

1. Passer `classify: true` côté `swigs-workflow` (1 ligne dans le hook)
2. Vérifier le temps de bout en bout (objectif <15s par tx avec
   `lexa-classifier` sur le Spark)
3. **Observation live du cron** — session 12 et 13 n'ont jamais observé
   un `:30` naturel sans redémarrage concurrent. Session 14 : attendre un
   tick sans activité, confirmer les logs `pm2 logs lexa-backend | grep
   connectors/bank`. Si ça fonctionne, valider end-to-end.

### D. Dettes techniques attaquables si temps restant (~1h)

1. **Health probe embedder** — remplacer le check superficiel `GET /health`
   par un vrai `embedder.embedOne("ping")` dans `routes/health.ts`. Le bug
   EMBEDDER_URL session 12→13 aurait été capté en 1 check.
2. **Table `companies` enrichie** — ajouter `tdfn_sector_code`, `civil_status`,
   `children_count`, `is_salarie BOOLEAN` pour simplifier les body requests
   des builders fiscaux. Migration `005_companies_fiscal.sql`.
3. **Ingestion complète des 60 secteurs TDFN** — extraire depuis les chunks
   Qdrant `AFC-INFO_TVA_12_TDFN` via un script Python. v1 couvre 21 secteurs,
   cible ~60.

---

## Dettes reportées (NE PAS traiter session 14 sauf si gros creux)

- Canton Genève (session 15+)
- Fiscal PM Sàrl/SA (session 15+)
- Validation XML eCH-0217 contre xsd officiel (session 15+)
- Webhook retour Lexa→Pro avec HMAC (session 15)
- Event `TvaCorrectionDeclared` pour corrections art. 72 (session 15+)
- Onboarding personnel PP (session 15+)
- Bug mapping eCH-0097 côté swigs-workflow (15 min quand creux)

---

## Plan session 14 (~5h)

| # | Action | Temps |
|---|---|---|
| 1 | Vérification infra (incluant `/rag/ask` live pour valider EMBEDDER_URL) | 10 min |
| 2 | Backend auth : migration users, routes /auth/register + /auth/login, middleware requireAuth | 1h30 |
| 3 | Frontend auth : store, Login route, interceptor JWT, RequireAuth wrapper | 45 min |
| 4 | Deploy frontend prod nginx + Let's Encrypt | 1h |
| 5 | Classifier auto pont Pro→Lexa (flip classify:true côté swigs-workflow, observer :30) | 45 min |
| 6 | Dette D1 — health probe embedder réel (fix du bug session 12→13) | 20 min |
| 7 | qa-lexa re-run + journal + commits + push | 30 min |

**Si ça déborde** : couper D (dette technique). Garder A (auth), B (deploy) et
C (classifier auto) comme noyau — ce sont les 3 enablers qui ouvrent Lexa à
un testeur externe.

---

## Décisions tranchées — ne plus réinterpréter

(reprise des décisions session 11 + 12 + 13)

1. **Canvas lib** → react-flow définitif
2. **Dark mode** → livré session 11
3. **Multi-tenant** → companiesStore pluriel, middleware backend `req.tenantId`
4. **Autonomie IA** → toujours validation humaine en v1
5. **Langue v1** → FR uniquement (i18next posée)
6. **Auth frontend** → JWT simple en session 14, SSO Hub session 15+
7. **Déploiement frontend** → subdomain `lexa.swigs.online` + Let's Encrypt
8. **Webhook retour Pro** → HMAC shared secret `X-Lexa-Signature`
9. **PDF generation** → pdfkit backend (pas @react-pdf/renderer) — **ratifié S12 + S13**
10. **Canvas minimap** → supprimée option A
11. **Template forms** → source canonique `01-knowledge-base/forms/` + copie
    runtime `apps/backend/src/execution/templates/`
12. **Fallback company orphelin** → `getCompany` émet minimale `CompanyInfo`
13. **Audit trail formulaires** → chaque `POST /forms/*` stocke un event
    `DeclarationGenerated` typé dans `LexaEvent`
14. **Disclaimer PDF/XML non retirable** → texte dans `template.output.pdf.disclaimer`
15. **Helpers execution mutualisés** (session 13) — tout builder importe
    depuis `shared.ts`, pas de duplication
16. **Idempotence par formKind** (session 13) — `formKind: 'tva' | 'vs-pp' | ...`
    dans l'event, queries filtrées, pas de collision entre domaines
17. **Un YAML + un Builder par formulaire** (session 13) — pas de builder
    générique, chaque domaine fiscal isolé
18. **Un Modelfile par canton pour les agents fiscaux** (session 13)
19. **qa-lexa comme baseline de régression** (session 13) — à chaque feature
    nouvelle, ajouter une fixture

---

## Infrastructure — vérification début session 14

```bash
# 1. Backend health
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health | python3 -m json.tool'
# → ok:true, postgres/qdrant/ollama/embedder tous true, 5388 pts

# 2. RAG live (captera le bug EMBEDDER_URL si récurrence)
ssh swigs@192.168.110.59 'curl -sX POST http://localhost:3010/rag/ask \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d "{\"question\":\"Taux TVA standard\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(\"cites:\",len(d.get(\"citations\",[])))"'
# → cites: 5 (sinon bug embedder à investiguer)

# 3. Modèles Ollama (4 modèles Lexa attendus)
ssh swigs@192.168.110.103 'ollama list | grep lexa-'
# → lexa-classifier, lexa-reasoning, lexa-tva, lexa-fiscal-pp-vs

# 4. qa-lexa baseline (doit rester 10/10)
cd apps/backend && BASE_URL=http://192.168.110.59:3010 npx tsx src/scripts/qa-lexa.ts

# 5. Stats events
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/transactions/stats/summary \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001"'
# → DeclarationGenerated ≥ 9, Classified ≥ 7, Ingested ≥ 9
```

Secrets :
- Sudo .59 : `Labo`
- Sudo Spark (.103) : `SW45id-445-332`
- Password Postgres `lexa_app` : `~/.lexa_db_pass_temp` (Mac) ou `.env` prod
- **EMBEDDER_URL doit être `http://192.168.110.103:8082`** (llama-server OpenAI compat)
  — jamais `:8001` (uvicorn ancien cassé)
- **Toujours exclure `.env` des rsync backend** — `--exclude=.env`

---

## Avertissements (héritage sessions 11-13)

1. **`.env` prod jamais rsync.** Deux bugs à la suite (postgres host
   127.0.0.1 → session 12 + EMBEDDER_URL :8082 → session 13) causés par des
   rsync agressifs. Règle immuable : rsync seulement `src/` ou avec
   `--exclude=.env`.
2. **Disclaimer PDF/XML obligatoire sur tous les formulaires.** Whitepaper §6
   phase 1. Le texte vit dans le template YAML `output.pdf.disclaimer`.
   Retirer ce marquage = décision explicite à documenter.
3. **Éviter les rsync pendant un `:30`** pour ne pas invalider l'observation
   du cron IMAP swigs-workflow.
4. **EMBEDDER_URL drift** : le bug session 12→13 (uvicorn 8001 vs
   llama-server 8082) est invisible au `/health` actuel. Priorité session 14
   dette D1 : remplacer par un vrai `embedder.embedOne("ping")`.
5. **qa-lexa doit rester 10/10** à chaque début de session. Si un test
   fail, investiguer avant tout travail sur feature nouvelle.
6. **Idempotence forms** : tout nouveau builder doit passer par
   `finalizeForm(form, opts?)` pour hériter automatiquement de l'idempotence.

---

**Dernière mise à jour** : 2026-04-15 (fin session 13 — 4 formulaires + 4 agents + qa-lexa + refactor)
