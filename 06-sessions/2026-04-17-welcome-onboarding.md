# Session 2026-04-17 — Lane M : Welcome Onboarding V1

## Contexte

Post-inscription, l'utilisateur arrivait sur `/workspace` avec un canvas vide, sans indication sur quoi faire. Cette session livre le flow d'onboarding V1.

## Fichiers créés

- `apps/frontend/src/components/onboarding/StartActionCards.tsx` — composant partagé des 3 CTAs (CAMT.053, OCR, Déclaration fiscale), routing dynamique PP/PM × canton
- `apps/frontend/src/routes/Welcome.tsx` — nouvelle route `/welcome` post-inscription

## Fichiers modifiés

- `apps/frontend/src/routes/Register.tsx` — redirect `/workspace` → `/welcome` après inscription
- `apps/frontend/src/App.tsx` — ajout route `/welcome` (RequireAuth, import non-lazy)
- `apps/frontend/src/routes/Workspace.tsx` — empty state overlay (0 écritures) avec `StartActionCards`
- `apps/frontend/src/i18n/locales/fr.json` — clés `welcome.*` + `workspace.empty.*`

## Clés i18n ajoutées

```
welcome.title
welcome.subtitle
welcome.greeting (interpolation {{company}})
welcome.explore_first
welcome.cta.camt053.title/desc/badge
welcome.cta.ocr.title/desc/badge
welcome.cta.tax.title/desc/badge
workspace.empty.title
workspace.empty.subtitle
```

## Deploy

- Build hash : `Bi-fBHtI`
- Path rsync : `/home/swigs/lexa-frontend/` (correct)
- Lexa title : `Lexa · Comptabilité IA suisse` ✓
- Swigs Pro title : `Swigs Pro — Projets, heures et factures tout-en-un` ✓

## Critères vérifiés

- [x] `/welcome` accessible post-register, 3 cards CTAs fonctionnelles
- [x] Card 3 route dynamique PP/PM × canton (SA-GE → `/pm/ge/2026`, RI-VS → `/taxpayer/2026`)
- [x] Empty state Workspace si 0 écritures (masqué sinon)
- [x] i18n fr cohérent
- [x] Build TypeScript 0 erreur
- [x] Deploy rsync bon path, hash validé par curl
- [x] Cross-apps OK (Lexa + Pro)

## Limitations / dettes

- i18n anglais non ajouté (le repo ne charge que `fr.json`, fallback `fr` configuré dans index.ts — pas de régression)
- Empty state affiché uniquement desktop (md:grid) comme le LedgerCanvas — cohérent avec le comportement existant
