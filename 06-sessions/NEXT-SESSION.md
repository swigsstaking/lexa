# NEXT SESSION — Point de reprise

**Dernière session** : [Session 14 — 2026-04-15](2026-04-15-session-14.md)
**Prochaine session** : Session 15 — **Retour à la valeur utilisateur : onboarding PP + 2e canton + observation cron live**

> Session 14 a ouvert la porte : Lexa est public sur `lexa.swigs.online`
> avec auth JWT, HMAC Pro→Lexa, et qa-lexa 10/10 via HTTPS. Session 15
> doit transformer ce que le testeur voit en quelque chose qu'il peut
> *vraiment* utiliser, en priorité le flow PP Valais qui reste une démo
> tant que l'utilisateur ne peut pas saisir son salaire.

---

## Ce qui marche après session 14

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` | ✅ HTTPS Let's Encrypt |
| Frontend prod | ✅ 716KB JS / 228KB gzip + SPA fallback |
| Nginx proxy `/api` → `:3010` | ✅ timeout 120s |
| **Auth** | |
| `POST /auth/register` | ✅ email+password+company, 409 si duplicate |
| `POST /auth/login` | ✅ rate limit 5/15min/IP |
| `GET /auth/me` | ✅ user + company jointure |
| `POST /auth/admin/reset-password` | ✅ X-Admin-Secret |
| `requireAuth` middleware | ✅ override req.tenantId depuis JWT |
| Isolation multi-tenant via JWT | ✅ vérifié (smoke test + qa-lexa) |
| Frontend login/register/logout + guards | ✅ dark mode, compile clean |
| **Pont Pro→Lexa** | |
| HMAC `X-Lexa-Signature` SHA256 timing-safe | ✅ smoke 4/4 |
| `pushTransactionToLexa` patché côté Pro | ✅ `classify:true` + signature |
| `LEXA_WEBHOOK_SECRET` partagé | ✅ posé des deux côtés |
| Classification auto end-to-end | ✅ FIDUCIAIRE DUPONT → 6510 TVA 8.1% |
| **Infra** | |
| `EmbedderClient.health()` réelle (dim 1024 check) | ✅ dette D1 résolue |
| qa-lexa 10/10 via HTTPS public | ✅ baseline classify 28s / tva 7.8s / fiscal-pp 13.8s |
| 4 agents actifs listés sur GET /agents | ✅ |

---

## Priorité session 15 — Option A : profondeur valeur (reco)

### A. Onboarding personnel PP — urgent (~2h)

Sans ça, le PDF VS-PP généré session 13 reste inutilisable pour un
contribuable : il affiche "revenu indépendant -6253 CHF" + 0 pour tous les
champs personnels (salaire, pilier 3a, LPP, intérêts, assurance, rachats).

1. **Migration `005_personal_profile.sql`** : table `personal_profile`
   keyée sur `tenant_id` avec colonnes `civil_status`, `children_count`,
   `revenu_salaire_annuel`, `pilier_3a_cotise`, `lpp_rachats`,
   `primes_assurance`, `interets_dette`, `frais_reels`, `is_salarie` bool,
   `commune`, `created_at`, `updated_at`.
2. **Frontend : ajouter un 5e step Personnel dans le wizard d'onboarding**
   ou un panel dédié `/workspace/personal` accessible via un bouton dans
   le header Workspace. Form contextuel : si `is_salarie=true`, afficher
   champs LPP + salaire, sinon champs indépendant. Plafond pilier 3a
   dynamique selon `is_salarie` (7056 vs 35280).
3. **Extension `VsPpFormBuilder.ts`** : lit `personal_profile` en plus
   du ledger et injecte les valeurs dans la projection. Frais pro reste
   un forfait 3% min 2000 max 4000, mais `frais_reels` si renseignés le
   remplacent.
4. **Validation** : relancer `POST /forms/vs-declaration-pp` pour le
   user de test avec un profil réaliste (salaire 85k + pilier 3a 5000 +
   LPP 10k + canton VS + commune Sion), le PDF doit afficher des
   chiffres cohérents avec le Guide PP VS 2024.

### B. Observation live du cron `:30` Pro→Lexa (~15 min, asynchrone)

Session 14 a prouvé le flow avec un HMAC manuel, mais n'a pas observé un
`:30` naturel. Session 15 début :

```bash
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 1000 --nostream | grep -iE "connectors/bank|X-Lexa-Signature" | tail -20'
```

Si les logs montrent des POST spontanés en provenance de swigs-workflow
depuis la session 14, **documenter** dans le journal 15 avec streamId,
timestamp, classification résultat. Sinon, investiguer pourquoi le cron
ne tire pas (le patch v1 session 09 peut avoir un cas limite avec la
signature HMAC si `JSON.stringify` mute les chiffres).

### C. Canton Genève — agent `lexa-fiscal-pp-ge` + formulaire (~2h)

Élargissement SR après Valais. Cible : un indépendant genevois.

1. **Ingestion KB** : vérifier que la loi fiscale GE est dans Qdrant
   (session 04 l'avait-il ingérée ? Sinon scraper LexFind GE). Ingérer
   aussi le Guide PP GE si disponible (ge.ch).
2. **Modelfile `lexa-fiscal-pp-ge`** : base qwen3.5:9b-optimized, SYSTEM
   prompt adapté GE (barème canton différent, déductions cantonales
   spécifiques, rabais d'impôts sur frais maladie, etc.). `ollama create`
   sur Spark.
3. **Template `01-knowledge-base/forms/ge-declaration-pp-2024.yaml`** :
   même structure que VS-PP mais avec `canton: GE` et `reference_amounts`
   2024 Genève (barème, déductions GE-spécifiques).
4. **Builder `GePpFormBuilder.ts`** + PDF renderer.
5. **Endpoint `POST /forms/ge-declaration-pp`** + idempotence.
6. **Agent endpoint `POST /agents/fiscal-pp/ask`** déjà en place —
   enrichir pour routage dynamique selon `company.canton` (VS → lexa-fiscal-pp-vs,
   GE → lexa-fiscal-pp-ge). Ou endpoint dédié `/agents/fiscal-pp-ge/ask`
   en v1 pour éviter de toucher au re-ranking existant.
7. **Frontend** : le bouton "Décl. PP" dans LedgerModal appelle le bon
   endpoint selon `activeCompany.canton`. Ajouter une option VS/GE dans
   le wizard d'onboarding.
8. **qa-lexa** : ajouter 2 fixtures GE pour maintenir le filet de
   sécurité.

### D. Corrections art. 72 LTVA dans le décompte annuel (~45 min)

Déclassé en priorité moyenne, mais complète le formulaire session 13 qui
a les champs `corrections_plus` et `corrections_moins` en TODO.

1. Nouveau event `TvaCorrectionDeclared` dans `LexaEvent` avec payload
   `{year, type: 'plus' | 'moins', amount, reason, declaredAt}`.
2. Endpoint `POST /corrections/tva` body `{year, type, amount, reason}`
   qui persiste l'event.
3. `TvaAnnualFormBuilder` lit les events `TvaCorrectionDeclared` du tenant
   pour l'année demandée et les intègre dans la projection.
4. PDF template annuel affiche les corrections (si > 0).
5. Pas d'UI dédiée — l'event peut être poussé via curl par le fiduciaire
   en attendant session 16 pour un form.

### E. Ingestion des 60 secteurs TDFN complet (~1h)

Session 13 a ingéré 21 secteurs hardcoded dans `tdfn-rates-2024.yaml`.
Session 15 automatise :

1. Script Python `ingest_tdfn_rates.py` qui query Qdrant filter
   `AFC-INFO_TVA_12_TDFN`, extrait les sections avec regex "secteur X :
   Y.Y%", produit un YAML étendu.
2. Review manuelle du YAML (20 min) puis remplacement de `tdfn-rates-2024.yaml`.
3. Frontend : le select secteur TDFN affiche ~60 options au lieu de 21.

---

## Option B — Retour à la plateforme (alternative si option A bloque)

1. **Webhook retour Lexa → Pro** : update `BankTransaction.lexaClassification`
   côté Mongo avec compte Käfer + TVA + citations. HMAC dans l'autre sens
   avec un secret séparé (`PRO_WEBHOOK_SECRET`). Événement `ClassificationAckFromPro`.
2. **Mode fiduciaire v1** : refactor `users.tenant_ids[]` en table de
   jointure `user_tenants (user_id, tenant_id, role)`. Frontend switcher
   de tenant dans le header. Le JWT transporte `currentTenantId` que
   le user peut changer via `POST /auth/switch-tenant`.
3. **Projections bilan + compte résultat** : views SQL sur `ledger_entries`
   groupées par catégorie Käfer (actifs/passifs/charges/produits), endpoint
   `GET /ledger/financial-statements?year=2026`. Affichage dans un nouvel
   overlay Cmd+Shift+B (Bilan).
4. **Monitoring minimal** : un endpoint `/metrics` format Prometheus qui
   expose `lexa_requests_total`, `lexa_request_duration_seconds`,
   `lexa_classifications_total`, `lexa_declarations_total` par type.
   Pas besoin de Grafana encore.

---

## Ma reco session 15

**Option A, avec A+B en noyau et C si temps**.

- **A onboarding PP** : c'est le seul travail qui transforme VS-PP de
  démo à produit. Un fiduciaire qui voit actuellement "-6253 CHF" dans le
  PDF ne démarrera pas.
- **B observation cron** : 15 min asynchrones, valide rétroactivement que
  le patch session 14 tourne en production naturelle.
- **C canton GE** si et seulement si le temps le permet après A et B.
  L'alternative est de cut GE pour session 16 et de faire à la place
  **D corrections art. 72** (45 min) qui referme la dette session 13.

---

## Dettes reportées (NE PAS traiter session 15 sauf si gros creux)

- Refresh tokens + email verification + password reset user-facing (session 16 avec fiduciaire)
- Webhook retour Lexa→Pro (session 16)
- Mode fiduciaire multi-clients (session 16+)
- Refactor code-splitting frontend pour descendre sous 500KB JS (session 17+)
- Bug mapping eCH-0097 côté swigs-workflow (15 min dédiés)
- Monitoring Prometheus/Grafana (session 18+)

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→14)

1. **Canvas lib** → react-flow définitif
2. **Dark mode** → livré session 11
3. **Multi-tenant isolation par JWT** → session 14 override req.tenantId
4. **Autonomie IA** → validation humaine obligatoire v1
5. **Langue v1** → FR uniquement (i18next posée, DE session 17+)
6. **Auth** → JWT simple HS256 7d, bcrypt cost 12, pas de refresh tokens v1, pas d'email verification v1
7. **Deploy** → subdomain `lexa.swigs.online` live, nginx + Let's Encrypt
8. **Webhook Pro→Lexa** → HMAC SHA256 `X-Lexa-Signature` timing-safe
9. **PDF** → pdfkit backend (toutes sessions)
10. **Canvas minimap** → supprimée option A (session 12)
11. **Template forms** → YAML canonique `01-knowledge-base/forms/` + copie runtime embed
12. **Fallback company orphelin** → `getCompany` émet minimale CompanyInfo
13. **Audit trail** → `DeclarationGenerated` event typé avec `formKind`
14. **Disclaimer PDF/XML non retirable** → texte dans template
15. **Helpers execution mutualisés** → `shared.ts`
16. **Idempotence par formKind** → query SQL JSONB
17. **Un YAML + un Builder par formulaire** → pas de mega-template
18. **Un Modelfile par canton** → `lexa-fiscal-pp-vs`, `lexa-fiscal-pp-ge` séparés
19. **qa-lexa baseline de régression** → 10/10 à chaque push
20. **HMAC service-to-service strictement séparé du JWT user-facing** (session 14)
21. **Raw body capture via express.json verify hook** (session 14)
22. **Deploy frontend HTTP → webroot → HTTPS** en 2 étapes pour LE (session 14)

---

## Infrastructure — vérification début session 15

```bash
# 1. Drifts .env (héritage sessions 12→13)
ssh swigs@192.168.110.59 'grep -E "DATABASE_URL|EMBEDDER_URL|JWT_SECRET|LEXA_WEBHOOK_SECRET" /home/swigs/lexa-backend/.env'
# Attendu : 127.0.0.1:5432, 192.168.110.103:8082, JWT_SECRET présent, LEXA_WEBHOOK_SECRET présent

# 2. Backend health via URL publique
curl -s https://lexa.swigs.online/api/health | python3 -m json.tool
# → ok:true, 5388 pts, embedder:true (vraie probe dim 1024)

# 3. Modèles Ollama (4 attendus)
ssh swigs@192.168.110.103 'ollama list | grep lexa-'
# → lexa-classifier, lexa-reasoning, lexa-tva, lexa-fiscal-pp-vs

# 4. qa-lexa 10/10 via HTTPS public
cd apps/backend && BASE_URL=https://lexa.swigs.online/api npx tsx src/scripts/qa-lexa.ts
# → 10/10 pass

# 5. Observer logs cron :30 session 14 → 15
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 1000 --nostream | grep -iE "connectors/bank|X-Lexa-Signature" | tail -20'
```

Secrets :
- Sudo .59 : `Labo`
- Sudo Spark (.103) : `SW45id-445-332`
- Password Postgres `lexa_app` : `~/.lexa_db_pass_temp` (Mac) ou `.env` prod
- `JWT_SECRET`, `ADMIN_SECRET`, `LEXA_WEBHOOK_SECRET` : dans `.env` prod sur `.59`
- Admin reset endpoint : `POST /api/auth/admin/reset-password` avec header `X-Admin-Secret`
- qa user test : `qa@lexa.test` / `QaLexa-Fixed-2026!` (re-seedable via `scripts/seed-qa-user.ts`)
- **EMBEDDER_URL doit être `:8082`** — jamais `:8001` (uvicorn ancien cassé)
- **Toujours exclure `.env` des rsync backend** — `--exclude=.env`

---

## Avertissements (héritage sessions 11-14)

1. **`.env` prod jamais rsync.** Règle immuable — rsync seulement `src/` avec `--exclude=.env`
2. **Disclaimer PDF/XML obligatoire** sur tous les formulaires (whitepaper §6)
3. **EMBEDDER_URL drift protection** : la health probe réelle session 14 la capte désormais
4. **qa-lexa doit rester 10/10** — adapté session 14 pour login+Bearer, si un test fail post-ajout d'une feature, investiguer avant push
5. **HMAC Pro→Lexa** : ne jamais JSON.stringify deux fois ou modifier le rawBody — axios reçoit la string telle quelle avec `Content-Type: application/json`
6. **JWT override req.tenantId** — le `X-Tenant-Id` header est ignoré côté routes protégées. Si un test en a besoin, utiliser un vrai user avec le bon tenant
7. **`certbot --nginx` bloque sur config ref cert manquant** — toujours démarrer par une config HTTP-only + `certbot --webroot`, puis config HTTPS finale

---

**Dernière mise à jour** : 2026-04-15 (fin session 14 — Lexa public sur lexa.swigs.online)
