# NEXT SESSION — Point de reprise

**Dernière session** : [Session 11 — 2026-04-14](2026-04-14-session-11.md)
**Prochaine session** : Session 12 — **Casser le 0% Execution layer + polish canvas**

> Session 12 est la session qui transforme la démo en produit. Le canvas/chat/onboarding sont séduisants mais non fonctionnels sans formulaires sortants. **Priorité #1 absolue : décompte TVA AFC.**

---

## Audit session 11 par l'instance mère — ce qui marche

Validé live via chrome-devtools sur `localhost:5190` :

| Test | Résultat |
|---|---|
| `/workspace` canvas react-flow | ✅ 7 nodes Käfer + 7 edges animées avec CHF + TVA |
| Dark mode `class="dark"` | ✅ palette cohérente |
| Header tenant switcher | ✅ "Tenant Seed (démo) VS" + Services OK + 5388 KB |
| Panel AGENTS top-left | ✅ 3 dots (classifier/reasoning/tva) |
| Timeline vivante | ✅ EXERCICE 2026, slider 104/365, Passé/Présent/Futur |
| `⌘K` → ChatOverlay | ✅ overlay non-modal, 3 tabs, input autofocus |
| Agent TVA live | ✅ 12.9s, Art. 25 al. 1 + Art. 29 al. 2 LTVA, 5 citations fedlex cliquables |
| `⌘⇧L` → LedgerModal | ✅ mode expert tabulaire, Esc ferme |
| `/onboarding` 4 steps | ✅ wizard dark mode, stepper, autofill UID |
| Middleware `X-Tenant-Id` | ✅ req.tenantId propagé backend |
| localStorage `lexa.companies` | ✅ Kozelsky Sàrl + Tenant Seed, activeCompanyId |
| Balance équilibrée | ✅ 13 103,80 CHF débit = crédit |
| TypeScript strict | ✅ tsc -b clean |

**Verdict mère** : *"Le canvas spatial + le chat overlay + le mode expert + la timeline + les agents visibles sont tous présents. Les 10 premières secondes d'interaction prouvent le '2 ans d'avance' du whitepaper de manière tangible. C'est démontable à un fiduciaire ou à un investisseur aujourd'hui."*

---

## Bugs à corriger début session 12 (priorité UX)

### P1 — MiniMap blanche casse le dark mode
`<MiniMap>` par défaut de React Flow apparaît en fond blanc/gris clair en bas à droite du workspace. **Option A (reco session 12)** : supprimer complètement `<MiniMap />` de `LedgerCanvas.tsx`. Un plan comptable à 7 nodes n'en a pas besoin, et quand il en aura 50-100 la minimap par défaut casserait encore plus le visuel. **Option B (session 13+)** : styliser avec props dark :
```tsx
<MiniMap
  style={{ background: 'rgb(11 11 15)', border: '1px solid rgb(38 38 42)' }}
  maskColor="rgba(11, 11, 15, 0.6)"
  nodeColor={(n) => n.data?.classColor ?? '#71717a'}
  nodeStrokeColor="#ef4444"
  pannable
  zoomable
/>
```
**Effort** : 5 min.

### P2 — Flicker "Services KO" au premier mount
`HealthIndicator` affiche rouge pendant le fetch initial avant de passer vert. Cause : `services: undefined` interprété comme down. **Fix** : ajouter un état "loading" distinct qui affiche "Vérification…" en neutre, puis bascule OK/KO seulement après résolution de la query.
**Effort** : 15 min.

### P3 — "Chargement du canvas..." 1-2s → skeleton
React Query loading state mais visuellement pas propre. **Fix** : remplacer le texte par un skeleton canvas — 6 placeholders ronds gris qui pulsent aux positions approximatives des futurs nodes (peut réutiliser `buildCanvas` avec données mock).
**Effort** : 20 min.

### P4 — Warning a11y IBAN Step Bank
Identifié déjà dans NEXT-SESSION session 10 P2 : "form field element should have an id or name attribute". **Fix** : ajouter `id` et `name` sur les inputs IBAN / QR-IBAN de `StepBank`.
**Effort** : 5 min.

**Total fixes P1-P4 : ~45 min.**

---

## Priorité #1 absolue — Execution layer (décompte TVA AFC)

> *"Un fiduciaire qui voit la démo actuelle dira 'joli mais où est ma déclaration TVA ?'. Sans Execution layer, Lexa reste une démo, pas un produit."*

**Cible session 12** : générer le **décompte TVA AFC trimestriel** à partir des events `TransactionClassified` du trimestre courant, filtré par `tvaCode` et `tvaRate`.

### Livrables session 12

1. **Template YAML** `01-knowledge-base/forms/tva-afc-decompte-effectif-2024.yaml`
   - Structure conforme à la couche 4 du whitepaper §3
   - Champs : `ca_imposable_81`, `ca_imposable_26`, `ca_imposable_38`, `impot_prealable`, `tva_due`, etc.
   - Source par champ : `projection.tva.XYZ` (référence au builder)
   - Validation requise/optionnelle par champ
   - Output : `pdf: template.tex` (ou simple pdfkit), `xml: eCH-0217-schema`

2. **Service `apps/backend/src/execution/TvaFormBuilder.ts`**
   - `buildDecompteTva(tenantId, quarter, year)` → `FilledForm`
   - Projette les events `TransactionClassified` du quarter → group by `tvaRate` + `tvaCode` + `debit/credit`
   - Somme HT / TTC / impôt préalable
   - Respecte le template YAML comme contrat
   - Pas de parsing YAML manuel : utiliser `yaml` npm package

3. **Endpoint `POST /forms/tva-decompte`**
   - Input : `{ quarter: 1-4, year: 2026, method?: 'effective' | 'tdfn' }`
   - Lit `tenantId` depuis `req.tenantId` (middleware déjà en place)
   - Retour : `{ pdf: base64, xml: string, form: filledTemplate }`
   - Stocker un event `DeclarationGenerated` dans l'event store pour audit trail

4. **Button frontend dans LedgerModal**
   - "Générer décompte TVA trimestriel" dans un header du modal
   - Select quarter (Q1/Q2/Q3/Q4) + year
   - Click → spinner → download PDF + XML automatique via blob
   - Toast de confirmation avec le streamId de l'event `DeclarationGenerated`

5. **PDF generation** : `@react-pdf/renderer` ou `pdfkit`
   - **Reco** : `pdfkit` côté backend Node (plus simple, pas de LaTeX, pas de React dans le serveur)
   - Template minimal : header AFC, champs tabulaires, signature placeholder
   - Marquage "PRÉPARÉ AUTOMATIQUEMENT PAR LEXA — à vérifier et valider par votre fiduciaire avant dépôt" explicite (whitepaper §6)

6. **Structure XML eCH-0217 minimale**
   - Schéma officiel à valider avec xsd
   - Ne viser que les champs critiques v1 : entreprise, periode, ca_imposable_par_taux, impot_prealable, tva_due
   - Reste des champs en TODO pour session 13+

### Pourquoi c'est la priorité

Une fois ce flow terminé, Lexa a son **premier artefact comptablement exploitable** : un PDF prérempli qu'un fiduciaire peut signer et déposer. C'est ce qui transforme la démo en produit. Score MVP "vendable" passerait de **~42% à ~55-60%**.

---

## État des lieux par layer (audit mère)

| Layer | % | Gap critique |
|---|---|---|
| 1. Knowledge | ~60% | Manquent 6 cantons SR + jurisprudence TF |
| 2. Data | ~50% | Manquent projections bilan + compte résultat, RLS Postgres |
| 3. Reasoning | ~25% | 3/7 agents (classifier/reasoning/tva). Manquent fiscal-PP, fiscal-PM, clôture, conseiller, audit |
| 4. **Execution** | **0%** | **Aucune génération de formulaire AFC — c'est LE trou majeur** |
| 5. Interface | ~40% | Manquent animations agents-au-travail, briefing proactif, multi-modal (voice/photo/drag), vues Documents/Conversations, mobile |
| 6. Infrastructure | ~75% | Manquent deploy frontend prod, auth, webhook retour Pro, monitoring |

**Score global pondéré MVP** : ~42% vendable / ~75% démo impressionnante.

---

## Plan session 12 (~5h)

| # | Action | Temps |
|---|---|---|
| 1 | Fix P1 MiniMap blanche (Option A : retirer) | 5 min |
| 2 | Fix P2 flicker Services KO | 15 min |
| 3 | Fix P3 skeleton canvas | 20 min |
| 4 | Fix P4 a11y IBAN inputs | 5 min |
| 5 | Push commits session 10 + 11 vers origin/main (après confirmation user) | 5 min |
| 6 | **Execution layer — décompte TVA AFC trimestriel** (template YAML + builder + endpoint + PDF + UI) | **3-4h** |
| 7 | Validation live pont Pro→Lexa (lire logs lexa-backend pour premières tx IMAP) | 15 min |
| 8 | Webhook retour Lexa→Pro (optionnel, si temps) | 45 min |
| 9 | Journal session 12 + commit + push | 30 min |

**Si ça déborde** : couper 7-8 vers session 13, garder 1-6 + 9 comme noyau.

---

## Décisions tranchées par l'instance mère (ne plus réinterpréter)

1. **Canvas lib** → `react-flow` définitif. Pas de benchmark tldraw (nodes métier avec handles, pas whiteboard libre).
2. **Dark mode** → déjà livré session 11 ✓
3. **Multi-tenant** → multi-company dans un seul user, **fiduciaire mode natif**. `companiesStore` avec `activeCompanyId` ✓ déjà en place.
4. **Autonomie IA** → **toujours validation humaine en v1**. Pas de seuil d'auto-validation. Shortcuts clavier pour valider vite.
5. **Langue v1** → **FR uniquement**, infra i18next posée mais un seul `fr.json`.
6. **Auth frontend session 12** → **JWT simple** côté backend, login/logout basique. **Pas de SSO Hub avant session 14+**.
7. **Déploiement frontend** → **subdomain dédié** : `lexa.swigs.local` en dev, `lexa.swigs.online` en prod avec cert Let's Encrypt. **Pas de path-based, pas de port exotique.**
8. **Webhook retour Pro** → **HMAC shared secret** dans header `X-Lexa-Signature`. Pas de JWT pour éviter la complexité. Shared secret dans env var des deux côtés.
9. **Bug mapping eCH-0097 côté Pro** → déjà corrigé fin session 11 (commit `5cc5b8c` branche `v2-refresh` dans swigs-workflow). À vérifier qu'il est bien déployé.

---

## Messages positifs (mère)

- Mono-repo propre
- `tsc -b` clean
- Fichiers bien nommés et organisés
- Usage Zustand + TanStack Query canonique
- `CompanySearchField` debounce 350ms parfaitement dimensionné
- `LedgerModal` overlay + Esc = exactement la bonne UX mode expert
- `ChatOverlay` sur le côté (pas plein écran) = intelligent : canvas reste visible, chat complémentaire pas bloquant

---

## Infrastructure — vérification début session 12

```bash
# 1. Backend health
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health | python3 -m json.tool'

# 2. llama-server BGE-M3
ssh swigs@192.168.110.103 'systemctl is-active lexa-llama-embed'

# 3. Modèles Lexa
ssh swigs@192.168.110.103 'ollama list | grep lexa-'
# → lexa-classifier, lexa-reasoning, lexa-tva

# 4. Balance ledger
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/ledger/balance | python3 -c "import sys,json;d=json.load(sys.stdin);print(\"balanced:\",d[\"totals\"][\"balanced\"])"'

# 5. LEXA_ENABLED actif dans .env Pro
ssh swigs@192.168.110.59 'grep LEXA /home/swigs/swigs-workflow/.env'
```

Si tout vert : attaque direct fix MiniMap + Execution layer TVA.

---

## Commits locaux à pousser

Repo `lexa/` branche `main` — **5 commits** ahead de origin/main :
```
b788fcf feat(session-11): pivot UX whitepaper — canvas spatial + dark mode + multi-tenant + cmd+k
48a9afc docs(session-11): refactor brief — pivot UX for whitepaper alignment
74b7b47 fix(companyLookup): eCH-0097 legal form mapping alignment with BFS V5 reality
5647848 docs(session-10): update NEXT-SESSION with smoke test results + dette technique P1-P4
1609b42 feat(frontend): session 10 — React 19 + Vite + Tailwind scaffold + onboarding wizard
```

Repo `swigs-workflow/` branche `v2-refresh` :
```
5cc5b8c fix(companyLookup): align eCH-0097 legal form mapping with BFS V5 reality
98b6c1b feat(bridge): non-blocking hook to push bank transactions to Lexa
```

**À pousser dès début session 12** (décision tranchée par l'instance mère).

---

## Quick-start session 12

```bash
# 1. Sync repos
cd ~/CascadeProjects/lexa
git log --oneline -8
git push origin main   # pousser session 10+11 (5 commits)

cd ~/CascadeProjects/swigs-workflow
git log --oneline -3
git push origin v2-refresh   # pousser 5cc5b8c

# 2. Vérifier infra (commandes ci-dessus)

# 3. Relancer frontend dev
cd ~/CascadeProjects/lexa/apps/frontend && npm run dev   # http://localhost:5190

# 4. Attaquer les 4 fixes P1-P4 (45 min), puis l'Execution layer TVA (3-4h)
```

---

## Avertissements

1. **Le canvas est la partie la plus séduisante mais l'Execution layer est ce qui transforme en produit**. Si tu n'as que 3h, sacrifie les polish mais pas l'Execution layer.
2. **Le marquage "préparé par Lexa, à vérifier/valider" est OBLIGATOIRE** sur le PDF généré (whitepaper §6 responsabilité phase 1).
3. **L'XML eCH-0217 doit être valide** ou clairement marqué comme brouillon. Ne pas prétendre être prêt à déposer si le schéma n'est pas validé contre le xsd officiel.
4. **Préférer `pdfkit` côté Node** à `@react-pdf/renderer` — plus simple pour un serveur, pas besoin de rendre du React dans le backend.
5. **Sudo .59 `Labo`**, sudo Spark `SW45id-445-332`, password Postgres `~/.lexa_db_pass_temp`.

---

**Dernière mise à jour** : 2026-04-14 (fin session 11 + audit instance mère + brief session 12 complet)
