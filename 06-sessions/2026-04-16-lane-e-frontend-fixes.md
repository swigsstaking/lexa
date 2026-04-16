# Lane E — Frontend Fixes S37 — 2026-04-16

**Branch** : main | **Commits** : cad4eaf → 7d9057a (7 commits)

## Contexte

Instance Lane E relancée après coupure API Anthropic. L'instance précédente avait commencé
le travail (taxEstimator.ts, Step6Generate, authStore, Documents.tsx) sans commit.
Cette session reprend de zéro, récupère le travail partial et complète les 4 bugs restants.

## Bugs traités (7/7)

### BUG-P1-01 — Cache session fiduciaire [commit cad4eaf]
Création d'un singleton `queryClient.ts` partagé entre `main.tsx` et `authStore.ts`.
Sur `setAuth`, `setToken` et `logout`, `queryClient.removeQueries()` purge le cache
TanStack Query. Évite l'affichage de données d'une session précédente après switch tenant.

### BUG-P2-02 — CTA wizard canton-aware [commit 1e9ee9d]
`Documents.tsx` importe `useActiveCompany`, dérive le `canton` de la société active,
construit le chemin `/taxpayer/ge|vd|fr/YEAR` ou `/taxpayer/YEAR` (VS). Avant : redirect
hardcodé `/workspace/taxpayer?year=...`.

### BUG-P2-03 — Bouton download PDF [commit c27182f]
`Step6Generate` PP stocke `pdfBase64` + `filename` dans le state result, affiche un bouton
"Télécharger ma déclaration PDF" (user-initiated, fallback auto-download).
`Step6GenerateVs` et `Step6GenerateCanton` avaient déjà un auto-download + helper `downloadPdf`.

### BUG-P2-04 — Estimateur live barèmes officiels [commit b9ca349]
Refonte de `taxEstimator.ts` : remplace les anciens brackets progressifs simplifiés
par des tranches marginales identiques aux YAML ingérés (TaxScaleLoader S33/S36).
Algorithme `getMarginalRate()` calque `calcIccPpFromScale()` backend. ICC/IFD live
cohérents avec PDF final.

### BUG-P1-02 — Label canton dynamique PmWizardSummary [commit 7072afe]
`PmWizardSummaryVs` accepte `canton?: string` (défaut 'VS'). Header "Aperçu en direct — PM {canton}"
et bloc "Estimation impôt PM {canton} {year}". `PmWizardCanton` passe `canton={canton}`.
Plus de "PM VS" figé quand canton=GE/VD/FR.

### BUG-P1-03 — Badge client actif header [commit 0a8b34d]
`Workspace.tsx` calcule `activeTenantName` depuis `fiduClients + activeTenantId`.
Badge discret "Client : {nom}" dans le header gauche quand `hasMultipleClients`.
Masqué mobile (<sm), visible desktop. Classes `stone-*` cohérentes avec palette.

### BUG-T01 — Side panel estimateur sticky mobile [commit 7d9057a]
Trois wizards (TaxpayerWizardCanton, PmWizardVs, PmWizardCanton) : aside devient
`fixed bottom-0` avec `bg-surface/95 backdrop-blur-sm border-t max-h-[40vh] overflow-y-auto z-10`
en mobile. Desktop (lg:) inchangé. Padding `pb-48 lg:pb-8` sur le conteneur pour
que le formulaire ne soit pas caché.

## Build & Deploy

- Build OK : 1.05s, index.js 286 KB (gzip 88 KB) — sous limite 310 KB
- Deploy rsync → swigs@192.168.110.59:/home/swigs/lexa-frontend/ ✓
- Push origin main : 8d13c25→7d9057a ✓

## Fichiers modifiés

- `apps/frontend/src/queryClient.ts` (nouveau)
- `apps/frontend/src/main.tsx`
- `apps/frontend/src/stores/authStore.ts`
- `apps/frontend/src/routes/Documents.tsx`
- `apps/frontend/src/components/taxpayer/shared/Step6Generate.tsx`
- `apps/frontend/src/utils/taxEstimator.ts`
- `apps/frontend/src/components/company/vs/PmWizardSummaryVs.tsx`
- `apps/frontend/src/routes/company/PmWizardCanton.tsx`
- `apps/frontend/src/routes/Workspace.tsx`
- `apps/frontend/src/routes/taxpayer/TaxpayerWizardCanton.tsx`
- `apps/frontend/src/routes/company/PmWizardVs.tsx`
