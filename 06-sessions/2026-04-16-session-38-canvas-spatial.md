# Session 38 — Canvas Spatial Whitepaper §1 + §5

**Date** : 2026-04-16
**Branch** : main
**Dev** : Sonnet 4.6 sous orchestration Opus 4.6

## Objectif

Livrer le différenciateur #1 du whitepaper : canvas infini avec agents visibles, timeline vivante, interactions riches. Route `/canvas` additive (Workspace préservé).

## Fichiers créés

### Routes
- `apps/frontend/src/routes/canvas/CanvasView.tsx` — route principale /canvas + mobile fallback

### Composants canvas
- `apps/frontend/src/components/canvas/CanvasCore.tsx` — wrapper ReactFlow principal + providers
- `apps/frontend/src/components/canvas/AgentNode.tsx` — node custom agents IA (11 instances)
- `apps/frontend/src/components/canvas/EntityNode.tsx` — node documents/drafts PP/PM
- `apps/frontend/src/components/canvas/TransactionNode.tsx` — node transactions comptables
- `apps/frontend/src/components/canvas/CanvasEdge.tsx` — edges typés (classification/declaration/document/internal)
- `apps/frontend/src/components/canvas/TimelineBar.tsx` — barre 12 mois + dots events fiscaux
- `apps/frontend/src/components/canvas/ChatSidebar.tsx` — drawer latéral chat par agent

### Hooks
- `apps/frontend/src/components/canvas/hooks/useCanvasData.ts` — fetch parallèle agents/docs/taxpayer/company/ledger → nodes + edges
- `apps/frontend/src/components/canvas/hooks/useCanvasLayout.ts` — persistance positions localStorage par tenant
- `apps/frontend/src/components/canvas/hooks/useAgentStates.ts` — state machine idle/thinking/ready/error

### Modifié
- `apps/frontend/src/App.tsx` — +route /canvas lazy-loaded
- `apps/frontend/src/routes/Workspace.tsx` — +bouton "Canvas IA" header (icon Network)

## Critères livrés

- [x] Route `/canvas` accessible (200 prod)
- [x] Toggle "Canvas IA" depuis Workspace header
- [x] Canvas react-flow infini pan/zoom + minimap + controls
- [x] 23+ nodes assemblés (11 agents + docs + drafts + transactions)
- [x] 3 node types custom stylisés (palette stone cohérente)
- [x] Edges typés entre agents et entities
- [x] Timeline bottom 12 mois avec events visibles
- [x] Click AgentNode → ChatSidebar drawer latéral fonctionnel
- [x] Drag nodes → positions sauvegardées localStorage par tenantId
- [x] Animations framer-motion (mount fade+scale, thinking pulse amber)
- [x] Mobile < 768px → message fallback propre
- [x] Build OK — 0 erreurs TypeScript
- [x] Non-régression routes / workspace → 200

## Bundle impact

- `CanvasView-*.js` : 28.83 kB / **8.91 kB gzipped** (lazy chunk)
- @xyflow/react déjà présent dans `style-*.js` (56 kB gzipped)
- Impact net pour /canvas : +8.91 kB gzipped (dans les 100 kB cible)

## Architecture technique

- **Agents** : 11 nodes en arc autour d'un centre (position calculée, override localStorage)
- **Edges** : classifier→transactions, fiscalPP→draft-taxpayer, fiscalPM→draft-company, cloture→docs
- **Données** : fetch parallèle avec React Query, staleTime 30-60s
- **Chat** : réutilise les mêmes endpoints agents (ragAsk, tvaAsk, classify, askCloture, askAudit, askConseiller)
- **États agents** : setAgentState() global → pulse amber quand "thinking", emerald quand "ready"

## Notes

- DESIGN : 100% palette stone-900/800/700/600/500/400/300/200/100, typographie Inter + JetBrains Mono pour labels agents
- Mobile fallback : `md:hidden` / `hidden md:flex` — propre, 0 JS conditionnel
- Pas de drag-to-connect V1 (read-only interactions)
- Reset layout via bouton "Reset layout" dans Panel top-right → clear localStorage + reload
