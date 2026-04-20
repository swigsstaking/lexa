# Lexa — Handoff instance Opus 4.7 → prochaine instance

**Date** : 2026-04-20
**Version** : V1.1 beta (Workspace V2 seule, mode light par défaut)
**Contexte** : ~70 commits sur cette session, migration V1 ReactFlow → V2 design prototype, 9 bugs P0 critiques corrigés, 3 rapports E2E (PP/PM/Fiduciaire) livrés

---

## 🎯 Où en est le projet

### V2 Workspace livrée (V1 supprimée)

La V1 `LedgerCanvas` ReactFlow a été **supprimée** (commit `5cc4df5`). Le workspace V2 basé sur le design prototype Claude Design est maintenant la **seule version** disponible.

**Routing V2** (`apps/frontend/src/components/workspace/WorkspaceV2.tsx`) :
- `legalForm === 'raison_individuelle' | 'societe_simple' | null` → `<PpWorkspace />` (swimlanes salarié)
- Sinon → `<PmWorkspace />` (3 vues : Colonnes A / Colonnes B / Ledger)
- Override URL : `?v2variant=pp` ou `?v2variant=pm` pour forcer

### 3 vues PM
1. **Colonnes A** (défaut) — flux G→D, 4 colonnes classes P/A/L/C, flèches courbes entre cartes
2. **Colonnes B** — Sankey épaisseur ∝ montant
3. **Ledger** — table filtrable + panel détail + mini graphe radial

### PP Workspace
- Hero profil + 5 KPIs (Salaire, Vie privée, Épargne, Impôts, Disponible)
- 4 swimlanes items cliquables → `PpDetailDrawer` avec mock tx
- Card Échéances dark + CTA "Simuler" préremplit le wizard

### Palette
- **Light par défaut** : cream `#F5F2EC` + orange chaud `#E08A3D` (token `--lexa`)
- **Dark opt-in** via `/settings/appearance` : stone (ancien Lexa)
- **Accent global** : `--accent: 224 138 61` (#E08A3D) light / `238 156 82` dark
- Header + Timeline **toujours dark** (chrome-bg `#0A0A0A`) quel que soit le thème
- Scope tokens dans `apps/frontend/src/index.css` `[data-theme="light"]` / `[data-theme="dark"]`

### CmdK modal (Cmd+K)
- Backdrop opaque `rgba(0,0,0,0.82)` + blur 8px
- Mode launcher (suggestions IA) + mode chat streaming
- Sélecteur agent : LEXA / TVA / CLASSIFIER
- Enter envoie au chat (si query non vide) ou déclenche suggestion
- Fichier : `apps/frontend/src/components/workspace/v2/LexaCmdK.tsx`

---

## 🔐 9 bugs P0 corrigés lors des E2E critiques

Rapports complets dans `06-sessions/e2e-{pp,pm,fidu}-2026-04-20/`.

| # | Bug | Fix commit | Validation Chrome MCP |
|---|-----|-----------|----------------------|
| 1 | Wizard PP inputs redirigent `/workspace` | `d0b218a` (cause racine) | ⏳ Lié token expiré |
| 2 | Wizard PM "Suivant" switch tenant | `f8e7ecc` + `86f135d` | ✅ URL reste `/pm/ge/2026` |
| 3 | Dropdown VUE navigations parasites | `f8e7ecc` (stopPropagation) | ✅ Dropdown ouvre proprement |
| 4 | CmdK Enter navigue au lieu d'envoyer | `f8e7ecc` | ✅ Envoie au chat |
| 5 | Empty state cards déconnectent | `d0b218a` (cause racine) | ✅ Navigate `/documents` sans logout |
| 6 | **RGPD** cache stale PP inter-tenants | `b9a40d0` | ✅ Switch Marine Duay → empty state isolé |
| 7 | `/workspace` sans `?v2variant` → cache PP | Déjà OK via `WorkspaceV2.tsx` | ✅ |
| 8 | Wizard PM CA/bénéfice à zéro | `86f135d` | ✅ CA 69 100 + Bénéfice 21 825 depuis GL |
| 9 | Login 401 silencieux redirect register | `d0b218a` | ⏳ À re-tester manuellement |

---

## 🧩 Architecture

### Frontend
- **React 18 + Vite + TanStack Query + Zustand persist**
- `apps/frontend/src/routes/Workspace.tsx` — route root workspace
- `apps/frontend/src/components/workspace/WorkspaceV2.tsx` — router PP/PM
- `apps/frontend/src/components/workspace/v2/` — 11 composants V2 :
  - `PmWorkspace`, `PmColumnsA`, `PmColumnsB`, `PmLedger`
  - `PpWorkspace` (+ `PpDetailDrawer` inline)
  - `AccountTile`, `DebitCreditBadge`, `LexaInsight`, `ViewSwitcher`
  - `LexaCmdK` (modal chat IA)
  - `soldeDirection.ts` (helper D/C convention comptable)
- `apps/frontend/src/components/canvas/LedgerDrawer.tsx` — drawer de détail compte (V1 réutilisé en V2)
- `apps/frontend/src/components/canvas/LedgerEntryEditor.tsx` — éditeur écriture (correct/create/lettrage)

### Backend
- **Node + Express + Postgres event-store + MongoDB (documents) + Redis (BullMQ) + Qdrant + Ollama/vLLM**
- Serveur backend prod : `swigs@192.168.110.59:/home/swigs/lexa-backend` (pm2 `lexa-backend`)
- Serveur IA : `swigs@192.168.110.103` (vLLM :8100 + Ollama :11434 + Qdrant :6333 + embedder :8082)
- Frontend prod : `swigs@192.168.110.59:/home/swigs/lexa-frontend/` servi via nginx `lexa.swigs.online`
- Bridge Pro : `swigs-workflow` sur `.59` (port 3004), HMAC bidirectionnel

### Migrations DB
- 001→014 : events, ledger, companies, users, taxpayer_drafts, fiduciary_memberships, RLS, email IMAP
- 015 : `ledger_entries.reconciles`
- 016 : `pro_lexa_tenant_map`
- 017 : index dedup bridge
- 018 : `events` fingerprint index
- 019 : `tenant_settings` (toggle Pro sync)
- 020 : `users.external_sso_id` (SSO Hub)
- **021** : matview `ledger_entries` étendue (`letter_ref`, `corrected`, `last_reasoning`)

### Auth
- SSO Swigs Hub (proxy login/register + Google + magic-link)
- JWT avec `hubUserId` + `memberships[]` + `activeTenantId`
- Intercepteur 401 frontend : ne logout plus sur routes `/auth/*` (fix `d0b218a`)

---

## 📍 Accès prod

- URL : https://lexa.swigs.online
- Compte test : `qa-test@lexa.test` / `LexaQA2026!` → accès à 4 tenants (corentin, Swigs Sa, Demo V2 SA, Marine Duay)
- Tenant seed test : **Demo V2 SA** `47eddb05-d46b-48cd-ad23-698cc30d1d89` — 30 transactions réalistes (jan→avril 2026, 10 comptes Käfer)
- SSH : `ssh swigs@192.168.110.59` (keys OK)
- DB : `psql 'postgresql://lexa_app:yrH7IK2szsme5BdUVh0iQsHoKK9qai3x@127.0.0.1:5432/lexa'` depuis .59
- Hub API : https://apps.swigs.online (Google OAuth `189258755312-e5qvv3oeq0d3o9q9180o5htabjh1u9mp.apps.googleusercontent.com`)
- Secrets partagés Pro/Lexa/Hub : `APP_SECRET_WORKFLOW` dans Hub `.env`

---

## ⚠️ Points chauds connus

### Bugs P1 non résolus
1. **Drawers swimlane PP** — fix commit `334a12f` présent mais user reporte "n'apparaissent pas" en prod. À vérifier après dernier deploy.
2. **Échéances PP cliquables** — fix `3886f73` présent. Même chose, à re-tester.
3. **Boutons nav wizard** (Identité/Revenus/Fortune…) — selon rapport PP, naviguent vers `/workspace` au lieu de changer de step. Non adressé, probable handler onClick mal branché.
4. **Assurance maladie** non préremplie dans wizard PP (workspace l'affiche 5 280 mais wizard step Déductions vide).

### Limitations documentées
- **PP_DATA mock** : les données workspace PP (Marie Rochat 116 500 CHF) sont globales, pas reliées au tenant réel. Affichées pour tout user PP jusqu'à ce qu'un schéma backend PP soit créé.
- **Wizard PM charges détaillées** : `86f135d` pré-remplit seulement `pm-ca` et `pm-benefit`. Le split personnel/matériel/amortissement nécessite un endpoint backend qui décompose les charges par classe (5xxx, 6xxx, etc.).
- **Fiduciaire consolidation** : pas de vue portefeuille cross-tenants. Switch uniquement.
- **AgentsPill** : indicateur visuel pur (pas d'action). Conditionnel sur `processingStatus.pending > 0 || chatLoading`.
- **CmdK agent tool ledger** : les questions "Combien de tx ?" ne consultent pas `/api/ledger`. Nécessite un tool côté backend agent.

### Dettes technique
- 2 erreurs TS pré-existantes dans `apps/backend/src/scripts/qa-lexa.ts` (Buffer/BlobPart Node 25) — à ignorer
- 1 erreur TS pré-existante dans `apps/backend/src/agents/audit/AuditAgent.ts` — mineur

---

## 🗺️ Roadmap V1.2 (prochaine instance)

Priorité décroissante :

### P1 restants
1. Re-tester drawers swimlane PP + échéances en prod après reload
2. Boutons nav steps wizard (mauvaise navigation hors wizard)
3. Préremplir assurance maladie dans step Déductions PP
4. Décomposer `chargesTotal` par classe (5xxx/6xxx) pour wizard PM step 2

### Features V1.2
5. **Schéma backend PP** pour remplacer PP_DATA mock — events `PpRevenueIngested`, `PpExpenseIngested`, `Pp3aContribution`, etc.
6. **Consolidation fiduciaire** — vue portefeuille cross-tenants (KPIs agrégés, alertes échéances)
7. **CmdK tool agent** — `get_ledger_summary`, `get_taxpayer_draft`, `suggest_deduction`
8. **XML eCH-0119/0229 end-to-end** — tester dépôt réel AFC après wizard réparé
9. **Workflow approbation notes de frais** côté Pro (manager approve/reject)
10. **Mobile V2** — adapter `PmWorkspace` + `PpWorkspace` au viewport 375px (actuellement `hidden md:block`)

### Backlog V2 (horizon T3 2026+)
- Cantons alémaniques (ZH, BE, AG, SG)
- Multi-langue DE/IT
- eBanking direct (Open Banking PSD2-CH)
- Intégrations Bexio/Abacus/Sage
- App mobile native (PWA d'abord)
- Canvas spatial exploratoire (reporté 2026-04-16)

---

## 📚 Docs de référence

- `00-vision/whitepaper.md` V0.2 — source de vérité fonctionnelle
- `05-roadmap/v1-improvements.md` — roadmap V1.1/V1.2 détaillée (à mettre à jour)
- `05-roadmap/milestones.md` — roadmap 24 mois macro
- `06-sessions/e2e-pp-2026-04-20/` — rapport PP (14 screenshots)
- `06-sessions/e2e-pm-2026-04-20/` — rapport PM (27 screenshots)
- `06-sessions/e2e-fidu-2026-04-20/` — rapport Fiduciaire (13 screenshots)
- Mémoire utilisateur : `~/.claude/projects/-Users-corentinflaction-CascadeProjects-lexa/memory/` (gotcha_ledger_view, reference_lexa_infra, feedback_rsync_env)

---

## 🚀 Instructions pour la prochaine instance

1. **Lire ce HANDOFF.md en entier** avant toute action
2. **Lire `05-roadmap/v1-improvements.md`** pour la roadmap V1.1+
3. **Lire `.claude/memory/MEMORY.md`** pour les gotchas techniques
4. **Chrome MCP dispo** pour validation visuelle obligatoire avant de reporter un fix
5. **Compte test** : `qa-test@lexa.test` / `LexaQA2026!` avec 4 tenants et 30 tx seed sur Demo V2 SA
6. **Pattern commit** : `feat/fix/docs/refactor(scope): description` + Co-Author `Claude Sonnet 4.6` ou `Claude Opus 4.7`
7. **Deploy** : `rsync -avz apps/frontend/dist/ swigs@192.168.110.59:/home/swigs/lexa-frontend/` après `pnpm build`, backend idem vers `/home/swigs/lexa-backend/` + `pm2 restart lexa-backend`
8. **Ne JAMAIS rsync `.env`** (diverge prod/local)
9. **User fait partie de fiduciaire swigs.online** — SSO Hub + multi-tenant sont critiques

---

**Dernier commit** : `86f135d fix(wizard): pré-remplir step2 PM depuis income statement GL si draft vide (BUG-8)`
