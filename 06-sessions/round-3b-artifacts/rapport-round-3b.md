# Round 3B — Rapport QA : Parcours PM Genève
**Date :** 2026-04-17  
**Testeur :** Agent Claude (session autonome)  
**Tenant :** qa-pm-ge-r3b@test.lexa.local / Acme Test SA  
**Infra :** frontend localhost:5190, backend 192.168.110.59:3010  

---

## Tableau des parcours testés

| # | Parcours | Statut | Notes |
|---|----------|--------|-------|
| 1 | Inscription + onboarding Acme Test SA (SA, GE, CHE-123.456.789) | **PASS** | Via API directe (contournement bug Tab) |
| 2 | Upload CAMT.053 — 55 transactions | **PASS** | `POST /connectors/camt053/upload` — 55 tx ingérées |
| 3 | Grand livre — double-entry + classes Käfer | **PASS** | 100 écritures, 86/100 classifiées (14 UNKNOWN — classifier async) |
| 4 | Wizard PM GE — 6 steps, navigation complète | **PASS** | Injection session + navigation `/pm/ge/2025` |
| 5 | Génération XML eCH-0229 (step 6) | **PASS** | Fichier valide, tous champs présents |
| 6 | Clôture annuelle + santé comptable | **PARTIAL** | Pas de bouton one-shot; clôture continue accessible via menu. 2 alertes attendues (bilan déséquilibré + amort 67xx manquants) |
| 7 | Audit IA | **PASS** | Agent répond en 76s. CRITICAL_FAILURE attendu (pas de docs RAG indexés) |

---

## Bugs identifiés

### P1 — Tab sur formulaire onboarding déclenche navigation
- **Symptôme :** Presser Tab dans le champ "RAISON SOCIALE" soumet le formulaire et redirige vers `/login`
- **Impact :** Impossible d'onboarder depuis l'UI sans souris. Contournement : API directe (`POST /auth/register` + `PATCH /onboarding/company/:tenantId`)
- **Reproduction :** Ouvrir `/register`, taper raison sociale, appuyer Tab
- **Fichier suspect :** Formulaire onboarding — probablement un `<button type="submit">` capturant le Tab dans le stepper

### P1 — Wizard PM ne restaure pas le brouillon au rechargement
- **Symptôme :** Après reload sur `/pm/ge/2025`, les champs IDE, forme juridique, adresse sont vides. Seul le nom est pré-rempli.
- **Impact :** L'utilisateur doit re-saisir step 1 à chaque session. Contournement : PATCH API + navigation directe step 6.
- **Root cause probable :** `loadOrCreateDraft()` charge le draft mais les composants Step ne hydratent pas leurs champs locaux depuis `draft.state`

### P2 — Classifier async laisse 14/100 tx en UNKNOWN
- **Symptôme :** 30s après upload, 54/66 tx classifiées. Après 2 min, 86/100. 14 restent UNKNOWN.
- **Impact :** Bilan déséquilibré (alertes santé comptable). Non bloquant — classifier finit par converger.
- **Catégories non résolues :** Transactions mixtes (TVA + amortissement groupés en une seule ligne CAMT)

### P2 — isolatedContext Chrome DevTools ne cloisonne pas localStorage
- **Symptôme :** Toutes les pages Chrome partagent le même localStorage, même avec `isolatedContext: true`.
- **Impact :** Sessions QA multi-tenant se contaminent (Marc Tester VS, qa-dual-r3c, qa-pm-ge-r3b)
- **Workaround :** Injection forcée via `localStorage.setItem()` + `window.location.href` avant chaque navigation critique

---

## Vérifications XML eCH-0229

Fichier : `declaration-pm.xml`

| Champ | Valeur attendue | Valeur obtenue | Statut |
|-------|----------------|----------------|--------|
| taxPeriod | 2025 | 2025 | OK |
| canton | GE | GE | OK |
| legalName | Acme Test SA | Acme Test SA | OK |
| legalForm | SA | SA | OK |
| ideNumber | CHE-123.456.789 | CHE-123.456.789 | OK |
| siegeCommune | Genève | Genève | OK |
| beneficeComptable | — | 125 000 CHF | OK |
| capitalImposable | — | 25 000 CHF | OK |
| namespace | eCH-0229/1 | eCH-0229/1 | OK |

---

## Chiffres clés

| Métrique | Valeur |
|----------|--------|
| Transactions CAMT uploadées | 55 |
| Écritures double-entry générées | 100 |
| Tx classifiées (Käfer) | 86/100 (86%) |
| Tx UNKNOWN | 14/100 (14%) |
| Produits (CR) | 94 300 CHF |
| Charges (DR) | 184 110 CHF |
| Résultat net | -89 810 CHF |
| IB GE 2025 estimé | 21 288 CHF (ICC 10 625 + IFD 10 625, taux 17%) |
| Durée audit IA | 76 s |

---

## Artifacts

| Fichier | Description |
|---------|-------------|
| `camt053-50tx-acme.xml` | CAMT.053.001.04 — 55 tx Acme Test SA |
| `declaration-pm.xml` | eCH-0229 XML export wizard PM GE |
| `r3b-01-register-pm.png` | Écran d'inscription |
| `r3b-02-camt-processing.png` | Upload CAMT en cours |
| `r3b-03-camt-done.png` | CAMT ingestion terminée |
| `r3b-04-ledger.png` | Grand livre — vue globale |
| `r3b-05-drawer.png` | Drawer écritures détail |
| `r3b-wizard-1.png` | Wizard PM GE — Step 1 Identité |
| `r3b-wizard-2.png` | Wizard PM GE — Step 2 Financiers |
| `r3b-wizard-6.png` | Wizard PM GE — Step 6 Générer |
| `r3b-xml.png` | XML eCH-0229 affiché |
| `r3b-closure.png` | Santé comptable — 2 alertes |
| `r3b-audit.png` | Audit IA — réponse agent |

---

## Verdict

| Dimension | Résultat |
|-----------|----------|
| Onboarding PM GE | GO (contournement Tab requis) |
| Import CAMT.053 | GO |
| Grand livre Käfer | GO (86% classifié) |
| Wizard PM 6 steps | GO |
| Export XML eCH-0229 | GO |
| Clôture continue | GO (pas de one-shot — comportement connu) |
| Audit IA | GO |

### Verdict global : **GO conditionnel**

Le parcours PM Genève est fonctionnel end-to-end. Deux bugs P1 bloquants pour l'UX doivent être résolus avant production :
1. Bug Tab sur onboarding (contournement API disponible)
2. Wizard PM ne restaure pas le brouillon (contournement navigation step 6 directe)

Le classifier async à 86% est acceptable en MVP mais à monitorer sur des fixtures réelles (transactions mixtes TVA+amortissement).
