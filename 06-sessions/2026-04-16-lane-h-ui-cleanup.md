# Lane H — UI Cleanup Workspace + Canvas

**Date** : 2026-04-16
**Agent** : Sonnet 4.6
**Scope** : `apps/frontend/**` uniquement

---

## Audit initial (Bloc A)

### Problèmes identifiés

| # | Zone | Problème | Composant | Classe suspecte |
|---|------|----------|-----------|----------------|
| 1 | Workspace mobile | `LedgerCanvas` s'affiche directement — nodes minuscules (160px min-width sur 375px), entièrement inutilisable | `Workspace.tsx` `<main>` | aucun fallback `md:hidden` |
| 2 | Canvas desktop — Controls | `Controls` react-flow positionnés `bottom:16px` par défaut, partiellement cachés derrière la `TimelineBar` (72px) | `CanvasCore.tsx` | `<Controls>` sans `style.bottom` |
| 3 | Canvas desktop — MiniMap | `MiniMap` react-flow positionnée `bottom:16px` par défaut, même superposition avec TimelineBar | `CanvasCore.tsx` | `<MiniMap>` sans `style.bottom` |
| 4 | Canvas + ChatSidebar | `ChatSidebar` en `fixed right-0 top-0 bottom-0 w-[420px] z-50` couvre l'header canvas, la timeline ET le canvas — pas de marge adaptative | `ChatSidebar.tsx` | `fixed` au lieu de `absolute`, `z-50` trop haut |
| 5 | Workspace desktop — badges | Badges flottants `top-4 left-4` et `top-4 right-4` pas correctement cachés sur mobile (ils apparaissaient sur mobile avec `pointer-events-none` mais visibles) | `Workspace.tsx` | pas de `hidden md:flex` |
| 6 | Workspace main | `overflow-hidden` manquant sur `<main>` — le canvas react-flow pouvait créer un scroll horizontal inattendu | `Workspace.tsx` | `relative min-h-0` sans `overflow-hidden` |
| 7 | FiscalTimeline mobile | Légende "Passé/Présent/Futur" prenait de l'espace sur mobile, comprimant le slider de timeline | `FiscalTimeline.tsx` | pas de `hidden sm:flex` |
| 8 | TimelineBar Canvas | Légende tx/doc/IA visible même quand la timeline était étroite, créant un overflow potentiel | `TimelineBar.tsx` | pas de `hidden lg:flex` |

---

## Fixes appliqués (Bloc B)

| Fichier | Changement | Commit |
|---------|-----------|--------|
| `Workspace.tsx` | Ajout fallback mobile (`md:hidden`) avec message "Vue comptable" + icône — LedgerCanvas déplacé dans `hidden md:block absolute inset-0` | fix(frontend): Workspace mobile fallback |
| `Workspace.tsx` | Badges flottants passés de `absolute` à `hidden md:flex absolute`, ajout `overflow-hidden` sur `<main>` | fix(frontend): Workspace — badges desktop only + overflow |
| `CanvasCore.tsx` | `Controls` et `MiniMap` : ajout `style={{ bottom: 88 }}` pour les sortir de derrière la TimelineBar (72px + 16px marge) | fix(frontend): Canvas Controls/MiniMap au-dessus timeline |
| `ChatSidebar.tsx` | `fixed right-0 top-0 bottom-0 w-[420px] z-50` → `absolute right-0 top-0 bottom-0 w-[380px] max-w-[50vw] z-30` | fix(frontend): ChatSidebar absolute dans zone canvas |
| `FiscalTimeline.tsx` | Légende masquée sur xs (`hidden sm:flex`), padding responsive `px-4 md:px-6`, `gap-2 md:gap-4`, `flex-shrink-0` ajouté | fix(frontend): FiscalTimeline responsive mobile |
| `TimelineBar.tsx` | Légende masquée sur md (`hidden lg:flex`) | fix(frontend): TimelineBar légende hidden md |

---

## Screenshots avant/après

| Vue | Avant | Après |
|-----|-------|-------|
| Workspace desktop 1920×1080 | `audit-before-workspace-desktop.png` | `audit-after-workspace-desktop.png` |
| Canvas desktop 1920×1080 | `audit-before-canvas-desktop.png` | `audit-after-canvas-desktop.png` |
| Canvas + ChatSidebar | `audit-before-canvas-with-chat.png` | `audit-after-canvas-with-chat.png` |
| Workspace mobile 375×812 | `audit-before-workspace-mobile.png` | `audit-after-workspace-mobile.png` |
| Canvas mobile 375×812 | `audit-before-canvas-mobile.png` | `audit-after-canvas-mobile.png` |

---

## Non-régression

Routes vérifiées accessibles :
- `/workspace` — OK (desktop + mobile)
- `/canvas` — OK (desktop + mobile fallback)
- `/login`, `/register` — non modifiées
- `/taxpayer/2026` — non modifiée
- `/pm/vs/2026` — non modifiée
- `/documents` — non modifiée
- `/close/2026` — non modifiée
- `/audit/2026` — non modifiée
- `/conseiller/2026` — non modifiée
- `/onboarding` — non modifiée

---

## Bundle

Build `✓ built in 557ms` — pas de nouvelle dépendance, changements purement Tailwind + positionnement.
`index-D-Uu1Lux.js` : 117.74 kB (identique à avant).
