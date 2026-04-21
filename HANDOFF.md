# Lexa — Handoff instance mère → prochaine instance

**Date** : 2026-04-21
**Version** : V1.2-dev (92% alignement whitepaper)
**Instance précédente** : Claude Sonnet 4.6 — focus V1.2 alignement whitepaper

---

## 🎯 Où en est le projet

### V2 Workspace (seule version, V1 supprimée)
- Routing V2 : `legalForm RI/SS/null` → `PpWorkspace`, sinon → `PmWorkspace` (3 vues)
- PP Workspace : données réelles depuis `/api/pp/summary` (fallback mock si vide)
- PM Workspace : 3 vues (Colonnes A / Colonnes B / Ledger)
- CmdK (Cmd+K) : chat IA streaming + context ledger injecté, agents LEXA/TVA/CLASSIFIER

### Wizards fiscaux — 7 cantons × 2 types (COMPLET)

| Canton | PP wizard | PM wizard | Barème PP KB | Barème PM KB |
|---|---|---|---|---|
| VS | ✅ | ✅ | ✅ | ✅ |
| GE | ✅ | ✅ | ✅ | ✅ |
| VD | ✅ | ✅ | ✅ | ✅ |
| FR | ✅ | ✅ | ✅ | ✅ |
| NE | ✅ | ✅ | ✅ | ✅ |
| JU | ✅ | ✅ | ✅ | ✅ |
| BJ | ✅ | ✅ | ✅ | ✅ |

### KB Qdrant swiss_law (~9761 points)
- Plan Käfer 66 comptes, OIFD+OLTVA 24 pts, AFC Circulaires ~36 pts
- Barèmes PP + PM pour 7 cantons (18 pts chacun)
- Swissdec Guidelines, LAVS, autres

### Stack technique
- **Frontend** : React 18 + Vite + TanStack Query + Zustand persist
- **Backend** : Node + Express + Postgres event-store + Redis/BullMQ + Qdrant + Ollama
- **Auth** : SSO Swigs Hub → JWT (`hubUserId` + `memberships[]` + `activeTenantId`)
- **Multi-tenant RLS** : `queryAsTenant()` obligatoire, `FORCE ROW LEVEL SECURITY` sur toutes les tables
- **Event-sourcing** : matview `ledger_entries` (REFRESH manuel si vide après import CAMT)

---

## 🔐 Accès prod

- URL : https://lexa.swigs.online
- Compte test : `qa-test@lexa.test` / `LexaQA2026!` → 4 tenants
- Tenant seed : **Demo V2 SA** `47eddb05-d46b-48cd-ad23-698cc30d1d89` — 30 tx réalistes
- Backend prod : `swigs@192.168.110.59` (pm2 `lexa-backend`, port 3010)
- IA/Qdrant : `swigs@192.168.110.103` (vLLM :8100, Ollama :11434, Qdrant :6333, embedder :8082)
- Frontend nginx : `/home/swigs/lexa-frontend/` → `lexa.swigs.online`
- DB : `psql 'postgresql://lexa_app:yrH7IK2szsme5BdUVh0iQsHoKK9qai3x@127.0.0.1:5432/lexa'` depuis .59

---

## ⚠️ Gotchas critiques

1. **Ne JAMAIS rsync `.env`** — prod/local divergent sur DB host
2. **`queryAsTenant()` obligatoire** pour toutes les tables RLS (pas `query()`)
3. **`ledger_entries` = matview** — jamais auto-refresh, REFRESH manuel si vide
4. **Embedder port 8082** (pas 8001) — BGE-M3 sur `.103:8082`
5. **Deploy pattern** : `pnpm --filter frontend build` → `rsync dist/ swigs@.59:/home/swigs/lexa-frontend/` → `rsync backend/src/ swigs@.59:/home/swigs/lexa-backend/src/` → `pm2 restart lexa-backend`

---

## 🏗️ Ce qui reste à faire

### V1.x (minor)
- ATF jurisprudence RAG (V2, ~500+ pts Qdrant — initiative séparée)
- Tests E2E PDF generation wizards NE/JU/BJ

### P1 non résolus (de V1.1)
- Drawers swimlane PP à re-tester en prod après reload
- Boutons nav steps wizard PP (naviguent hors wizard au lieu de changer de step)
- Assurance maladie non préremplie dans wizard PP step Déductions

---

## 🚀 Prochaine instance mère — Deux axes

### Axe 1 — UX Import automatique PP (côté logiciel + interface)

**Objectif** : réduire la friction de saisie pour les contribuables PP en permettant l'import automatique de documents fiscaux et financiers.

**Features à concevoir et implémenter :**

1. **Modal d'import PP** — interface permettant d'uploader/importer :
   - Certificats de salaire (PDF/image) → OCR → pré-remplissage revenus
   - Attestations de fortune (relevés bancaires, dépôts titres) → parsing → fortune 31.12
   - Documents de placement (fonds, actions, obligations) → positions + valorisation
   - Images de frais (notes de repas, transport, matériel) → OCR → déductions
   - Polices d'assurance (3a, maladie, vie) → primes déductibles

2. **Blockchain / crypto** :
   - Saisir des adresses wallet (ETH, BTC, autres)
   - Lexa appelle des APIs blockchain (Etherscan, Blockstream, etc.) chaque 31 décembre
   - Calcul automatique : solde en CHF au taux du 31.12 → bilan fiscal crypto conforme AFC
   - Affichage dans PP Workspace (nouvelle swimlane "Crypto/Blockchain")

3. **Pipeline OCR/IA** :
   - Upload image/PDF → traitement via IA locale (ou service OCR)
   - Extraction structurée des données → proposition de pré-remplissage
   - Validation humaine avant commit dans le wizard

### Axe 2 — Unification stack IA locale DGX Spark

**Objectif** : simplifier et optimiser la stack IA partagée entre tous les produits Swigs.

**Contexte actuel :**
- Lexa : Ollama + Qwen (modèle actuel) + vLLM
- Swigs Workflow : potentiellement modèle différent
- AI Builder : potentiellement modèle différent
- DGX Spark : ressources limitées → éviter de charger N modèles différents

**Features à implémenter :**
1. **Benchmark Qwen 3.5 vs Gemma 4** (et d'autres candidats) sur cas d'usage réels :
   - RAG fiscal (qualité réponses sur questions TVA, impôt PP/PM)
   - Génération de texte structuré (JSON, YAML pour wizards)
   - Chat streaming (latence, cohérence)
   - Critères : précision fiscale CH, vitesse, RAM footprint
2. **Sélection du modèle gagnant** et déploiement unique sur DGX
3. **Adapter Lexa, Swigs Workflow, AI Builder** pour utiliser le même endpoint Ollama/vLLM
4. Documenter la configuration et le Modelfile pour le modèle retenu

---

## 📚 Docs de référence

- `00-vision/whitepaper.md` V0.2 — source de vérité fonctionnelle
- `05-roadmap/milestones.md` — roadmap 24 mois macro
- `06-sessions/2026-04-21-v1-2-alignement-whitepaper.md` — récap dernière session (état KB, score 92%)
- `06-sessions/e2e-{pp,pm,fidu}-2026-04-20/` — rapports E2E V1.1
- Mémoire : `~/.claude/projects/-Users-corentinflaction-CascadeProjects-lexa/memory/`

---

## 📋 Instructions pour la prochaine instance

1. **Lire ce HANDOFF.md en entier** avant toute action
2. **Lire `~/.claude/memory/MEMORY.md`** pour les gotchas techniques
3. **Chrome MCP** disponible pour validation visuelle — utiliser `take_snapshot` pour les uids
4. **Plan mode** pour toute tâche > 3 étapes
5. **Agents en parallèle** — toujours lancer 2 agents simultanément quand indépendants
6. **Commit pattern** : `feat/fix/docs(scope): description` + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
7. **Ne pas implémenter sans avoir vérifié** que la feature n'existe pas déjà (lancer un Explore agent d'abord)

---

**Derniers commits :**
```
b13379f feat(kb): barèmes PM NE/JU/BJ + fix Käfer + smoke test slice guards
8f6eba9 feat(cantons): wizards PM + barèmes PP NE / JU / Jura bernois 2026
f38a015 feat(v1.2): wizards PP NE/JU/BJ + eCH-0217 complet + validation XSD
bc61c8d feat(v1.2): PP backend réel, CmdK tools, fidu consolidée, mobile V2, KB +103pts
a4a9f8f docs(handoff): V1.1 state + 9 P0 fixés + transition instance
```
