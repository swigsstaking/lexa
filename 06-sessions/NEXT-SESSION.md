# NEXT SESSION — Point de reprise

**Dernière session** : [Session 12 — 2026-04-14](2026-04-14-session-12.md)
**Prochaine session** : Session 13 — **Consolider Execution + ouvrir Reasoning fiscal-PP VS**

> Session 12 a livré le premier formulaire officiel (décompte TVA AFC
> trimestriel) end-to-end : template YAML + builder + endpoint + PDF + XML +
> UI. Session 13 doit le rendre robuste (idempotence, classification auto du
> pont), attaquer la v2 du template (champs TODO), et ouvrir le deuxième
> formulaire : déclaration fiscale PP Valais.

---

## Ce qui marche après session 12

| Composant | État |
|---|---|
| `POST /forms/tva-decompte` | ✅ HTTP 200, tenant-aware, audit event |
| Template YAML `01-knowledge-base/forms/tva-afc-decompte-effectif-2024.yaml` | ✅ source canonique |
| Copie runtime `apps/backend/src/execution/templates/` | ✅ embed |
| `TvaFormBuilder` projection events → FilledForm | ✅ SQL sur ledger_entries, fallback company |
| PDF pdfkit avec disclaimer rouge | ✅ 1 page A4 valide |
| XML eCH-0217 `status="draft"` | ✅ bien formé, TODO annotations |
| Event `DeclarationGenerated` dans event store | ✅ audit trail |
| Button LedgerModal → download PDF+XML blob | ✅ compile clean (UI smoke manuel au prochain `npm run dev`) |
| CanvasSkeleton au loading | ✅ |
| HealthIndicator tri-état `checking/up/down` | ✅ plus de flicker |
| MiniMap retirée de LedgerCanvas | ✅ |

---

## Priorité session 13

### A. Durcir l'Execution layer (~2h)

1. **Idempotence `/forms/tva-decompte`** — ajouter un paramètre
   `idempotencyKey?` ou vérifier `eventStore.readByType("DeclarationGenerated")`
   pour un match `(tenant, formId, period, version)`. Si trouvé, retourner
   l'event existant au lieu d'en créer un nouveau. Sans ça, chaque click UI
   pollue l'audit trail
2. **Validation XML contre xsd officiel eCH-0217** : télécharger le schéma
   depuis `www.ech.ch/vechweb/page?p=dossier&documentNumber=eCH-0217`, valider
   avec `xmllint --schema`, corriger les éléments manquants. Retirer
   `status="draft"` quand validé
3. **Champs TODO du template** : acquisitions intra-groupe, diminutions de
   contre-prestation, prestations à soi-même, exportations, CA zero-rated.
   Étendre le builder, le PDF et l'XML en cohérence
4. **Signature PDF** : zone de signature manuscrite en bas du PDF pour
   impression/signature papier. SuisseID / Mobile ID reporté v2+

### B. Agent TVA + classifier sur le pont Pro→Lexa (~2h)

Actuellement le cron IMAP :30 de swigs-workflow POST avec `classify:false`,
donc les transactions arrivent dans le grand livre **sans classification**.
Activer le pipeline :

1. Passer `classify: true` côté Pro → Lexa appelle `lexa-classifier` sur
   chaque transaction reçue
2. Vérifier le temps de bout en bout (objectif <15s par tx avec
   `lexa-classifier` sur le Spark)
3. **Validation live du cron** — session 12 n'a pas pu observer un :30
   naturel. Session 13 : attendre un tick sans redémarrage concurrent,
   confirmer les logs `pm2 logs lexa-backend | grep connectors/bank` en
   provenance de swigs-workflow

### C. Premier formulaire fiscal PP Valais (~3h, gros morceau)

Deuxième formulaire de l'Execution layer après TVA AFC. Cible : indépendant
romand VS (canton prioritaire whitepaper §1).

1. Rechercher le formulaire officiel VS 2024/2025 (guide PP, formulaire
   principal, annexes amortissements / charges / revenus)
2. Créer `01-knowledge-base/forms/impot-vs-pp-2024.yaml` avec tous les champs
   et leur mapping projection
3. Nouveau agent `lexa-fiscal-pp` (Modelfile) qui citera les articles de la
   LF VS (`lf.vs.ch`) déjà dans Qdrant (session 03/04 a ingéré Guide PP 2024
   + barème 2026 + loi fiscale VS)
4. Service `FiscalPpVsFormBuilder.ts` qui projette les events du bilan annuel
   + déductions forfaitaires + impôt anticipé
5. Endpoint `POST /forms/fiscal-pp-vs`
6. PDF + button LedgerModal (réutiliser le pattern du décompte TVA)

### D. Auth JWT simple (~1h)

Décision tranchée #6 session 11 : login/logout basique en session 13, SSO Hub
reporté session 14+. Passwords hashés bcrypt en DB, middleware Express qui
remplace le middleware tenant naïf, session frontend persistée.

---

## Bugs / limites connues à corriger

| # | Symptôme | Fix envisagé | Effort |
|---|---|---|---|
| 1 | Tenant seed n'a pas de row dans `companies` → PDF affiche "Tenant XXXXXXXX" | Créer une company "démo" pour le seed via script de migration idempotent | 10 min |
| 2 | `rsync --delete` sur `apps/backend/` écrase le `.env` prod | Toujours `--exclude=.env` ou rsync seulement `src/` | doc |
| 3 | Postgres .59 écoute sur `127.0.0.1:5432` uniquement, `.env` local en dev ne peut pas s'y connecter | Ajouter un tunnel SSH ou rsync le DATABASE_URL local vers 127.0.0.1 | 5 min |
| 4 | Cron IMAP `:30` swigs-workflow non observé en session 12 | Attendre un tick sans activité de restart concurrente | observation |
| 5 | Template YAML en double (source canonique `01-knowledge-base/forms/` + copie runtime `apps/backend/src/execution/templates/`) | Ajouter un step `npm run build:forms` qui copie automatiquement | 20 min |
| 6 | Chaque click "Générer décompte" crée un nouveau `DeclarationGenerated` event | Idempotence via `(tenant, formId, period, version)` | cf. A1 |

---

## État des lieux par layer après session 12

| Layer | % S11 | % S12 | Évolution |
|---|---|---|---|
| 1. Knowledge | ~60% | ~60% | +1 template YAML forms |
| 2. Data | ~50% | ~52% | +event `DeclarationGenerated` dans `LexaEvent` |
| 3. Reasoning | ~25% | ~25% | — |
| 4. **Execution** | **0%** | **~15%** | **premier formulaire livré bout en bout** |
| 5. Interface | ~40% | ~44% | +skeleton canvas, +tri-état health, +button exec TVA |
| 6. Infrastructure | ~75% | ~75% | — |

**Score global pondéré MVP** : ~42% → **~50% vendable** / **~78% démo impressionnante**.

L'ajout du décompte TVA AFC fait passer la démo du *"canvas joli"* au
*"canvas + PDF comptablement exploitable"*. Un fiduciaire peut
désormais générer le décompte, relire, signer, déposer sur ePortal manuellement.

---

## Plan session 13 (~5h)

| # | Action | Temps |
|---|---|---|
| 1 | Idempotence `/forms/tva-decompte` + tests | 45 min |
| 2 | Validation XML contre xsd eCH-0217 officiel | 45 min |
| 3 | Passage `classify:true` côté pont Pro→Lexa + vérification temps | 45 min |
| 4 | **Déclaration fiscale PP VS** (template YAML + builder + endpoint + PDF + agent `lexa-fiscal-pp`) | **3h** |
| 5 | Auth JWT simple (login/logout, middleware, frontend) | 1h |
| 6 | Journal session 13 + commits + push | 30 min |

**Si ça déborde** : couper 2 et 5, garder 1 + 3 + 4 + 6 comme noyau.

---

## Décisions tranchées — ne plus réinterpréter

(reprise des décisions session 11 + ratifications session 12)

1. **Canvas lib** → react-flow définitif
2. **Dark mode** → livré session 11
3. **Multi-tenant** → companiesStore pluriel, middleware backend `req.tenantId`
4. **Autonomie IA** → toujours validation humaine en v1
5. **Langue v1** → FR uniquement (i18next posée)
6. **Auth frontend** → JWT simple en session 13, SSO Hub session 14+
7. **Déploiement frontend** → subdomain `lexa.swigs.online` + Let's Encrypt
8. **Webhook retour Pro** → HMAC shared secret `X-Lexa-Signature`
9. **PDF generation** → pdfkit backend (pas @react-pdf/renderer) — **ratifié session 12**
10. **Canvas minimap** → supprimée option A — **ratifié session 12**
11. **Template forms** → source canonique `01-knowledge-base/forms/` + copie
    runtime `apps/backend/src/execution/templates/` — **décision session 12**
12. **Fallback company orphelin** → `getCompany` émet minimale `CompanyInfo`
    si pas de row DB, au lieu de throw — **décision session 12**
13. **Audit trail formulaires** → chaque `POST /forms/*` stocke un event
    `DeclarationGenerated` typé dans `LexaEvent` — **décision session 12**
14. **Disclaimer PDF/XML non retirable** → texte dans `template.output.pdf.disclaimer`
    (YAML source de vérité), rendu en box rouge PDF + `<disclaimer>` XML.
    Whitepaper §6 phase 1 — **ratifié session 12**

---

## Infrastructure — vérification début session 13

```bash
# 1. Backend health
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health | python3 -m json.tool'

# 2. Embedder + modèles Ollama
ssh swigs@192.168.110.103 'systemctl is-active lexa-llama-embed && ollama list | grep lexa-'

# 3. Balance ledger
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/ledger/balance | python3 -c "import sys,json;d=json.load(sys.stdin);print(\"balanced:\",d[\"totals\"][\"balanced\"])"'

# 4. LEXA_ENABLED actif dans .env Pro
ssh swigs@192.168.110.59 'grep LEXA /home/swigs/swigs-workflow/.env'

# 5. Smoke test /forms/tva-decompte (doit passer HTTP 200)
ssh swigs@192.168.110.59 'curl -sX POST http://localhost:3010/forms/tva-decompte \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d "{\"quarter\":2,\"year\":2026,\"method\":\"effective\"}" | head -c 200'

# 6. Vérifier les events DeclarationGenerated (nouveau type session 12)
ssh swigs@192.168.110.59 'PGPASSWORD=$(grep DATABASE_URL /home/swigs/lexa-backend/.env | sed "s/.*lexa_app:\([^@]*\)@.*/\1/") psql -U lexa_app -d lexa -h 127.0.0.1 -c "SELECT COUNT(*) FROM events WHERE type = '"'"'DeclarationGenerated'"'"'"'
```

Secrets :
- Sudo .59 : `Labo`
- Sudo Spark (.103) : `SW45id-445-332`
- Password Postgres `lexa_app` : `~/.lexa_db_pass_temp` (Mac) ou `.59:/home/swigs/lexa-backend/.env`
- **Attention** : Postgres .59 écoute sur 127.0.0.1:5432 uniquement, le `.env` prod
  doit contenir `@127.0.0.1:5432`, pas l'IP publique `@192.168.110.59:5432`

---

## Avertissements

1. **Toujours exclure `.env` des rsync de déploiement backend.** Session 12 a
   eu un incident où `rsync --delete` depuis `apps/backend/` a écrasé le `.env`
   prod et causé un crash loop ECONNREFUSED 5432. Préférer rsync seulement
   `src/` avec `--exclude=.env` (cf. section "Commandes utiles" session 12).
2. **L'Execution layer ne doit JAMAIS prétendre remplacer un fiduciaire**. Le
   disclaimer "préparé par Lexa, à vérifier et valider" est obligatoire dans
   tous les PDF et XML générés. Toute modification du template YAML qui
   retirerait ce marquage doit faire l'objet d'une décision explicite (whitepaper §6).
3. **L'XML eCH-0217 session 12 est en `status="draft"`.** Ne pas déclarer prêt
   à déposer avant validation contre le xsd officiel (cf. priorité A2 session 13).
4. **Éviter de courir les rsync pendant un :30** pour ne pas invalider
   l'observation du cron IMAP swigs-workflow.

---

**Dernière mise à jour** : 2026-04-14 (fin session 12 — Execution layer v1 livré)
