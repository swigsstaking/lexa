# Lane B — Menu Grouping S37 (2026-04-16)

## Contexte
Lane parallèle B de la session S37. Objectif : réorganiser la nav header en sous-menus catégorisés.

## Avant
Nav plate de 7 boutons inline dans `Workspace.tsx` :
- Switcher fiduciaire (inline dropdown custom)
- Status services
- Chat IA (btn)
- Mode expert / Ledger (btn)
- Déclaration PP (btn)
- Déclaration PM (btn)
- Clôture (btn)
- Documents (btn)
- Audit (btn)
- Conseiller (btn)
- Logout (btn)

Total : 10+ éléments côte à côte → débordement sur petits écrans.

## Après
4 dropdowns dans `<nav>` (desktop md+), burger mobile (<md) :

| Dropdown | Items |
|---|---|
| Déclarations | PP canton-aware, PM canton-aware |
| Comptabilité | Clôture, Documents, Audit |
| IA | Chat IA (⌘K), Conseiller fiscal, Mode expert (⌘⇧L) |
| Paramètres | Switcher fiduciaire (si multi-clients) + Déconnexion |

## Fichiers créés / modifiés
- `apps/frontend/src/components/Nav/NavDropdown.tsx` — composant réutilisable dropdown accessible (ArrowDown/Up clavier, Escape, click-outside)
- `apps/frontend/src/components/Nav/MobileMenu.tsx` — burger menu mobile avec groupes dépliables
- `apps/frontend/src/routes/Workspace.tsx` — refactorisé pour utiliser les nouveaux composants

## Décisions techniques
- Pas de Headless UI (absent du projet) → useState + useEffect mousedown click-outside
- Canton-aware préservé : `taxpayerPath` et `pmPath` calculés depuis `company?.canton`
- Switcher fiduciaire S32 migré dans dropdown Paramètres (plus de `useRef` séparé)
- LucideIcon importé via `import type` (verbatimModuleSyntax strict)

## Build
- 0 erreur TypeScript
- Bundle `index.js` : 286.54 KB (vs ~284 KB avant, +0.9% — négligeable)

## Deploy
- `rsync` vers `swigs@192.168.110.59:/home/swigs/lexa-frontend/`
- Hash bundle déployé : `index-TG6Buywh.js`

## Non-régression routes
Toutes → HTTP 200 :
- /taxpayer/2026, /taxpayer/ge/2026
- /pm/vs/2026
- /documents, /close/2026, /audit/2026, /conseiller/2026

## Commits
- `feat(frontend): regroupement nav header en 4 sous-menus (Déclarations, Compta, IA, Paramètres)`
- `docs(lane-b-menu): journal lane B parallèle S37 — menu grouping`
