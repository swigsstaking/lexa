# NEXT SESSION — Point de reprise

**Dernière session** : [Session 10 — 2026-04-14](2026-04-14-session-10.md)
**Prochaine session** : Session 11 — **Refactor UX pour alignement whitepaper** (canvas + dark mode + multi-company + chat intégré)

> **Lecture OBLIGATOIRE avant de toucher une ligne de code :**
> 1. `00-vision/whitepaper.md` — section 5 "Interface Layer"
> 2. `00-vision/north-star.md` — les 6 principes du "2 ans d'avance"
>
> Session 10 a livré un scaffold fonctionnel mais tabulaire qui ressemble à Bexio. Session 11 = **refactor de trajectoire** pour s'aligner sur le whitepaper. Le code technique est solide et réutilisable — l'erreur est uniquement dans la philosophie UX. **Ne jette rien, refactore.**

---

## Pourquoi ce refactor est non-négociable

**Lexa n'est pas Bexio-2.** Lexa n'est pas un dashboard SaaS B2B avec sidebar + tableau. Le whitepaper est explicite (§5 + north-star) :

1. **Spatial, pas tabulaire** — canvas infini avec nœuds vivants, pas de tables Excel-like
2. **Conversationnel first** — le chat est l'interface PRIMAIRE, pas un gadget latéral
3. **Timeline vivante** — scroll dans l'année fiscale (passé/présent/futur prédit)
4. **Agents visibles** — entités animées sur le canvas pendant qu'ils travaillent
5. **Briefing quotidien proactif**
6. **Multi-modal total** (photo, voix, drag-drop, email forward, QR)
7. **Dark mode par défaut** — typographie Inter + JetBrains Mono, accents signalétiques
8. **Inspiration Linear / Arc / Things 3**

Session 10 a pris le cap classique tabulaire pour aller vite. Session 11 rattrape — **avant** tout deploy prod.

---

## Décisions structurelles tranchées (par l'user fin session 10)

### Q1 — Pivot interface maintenant
**Oui, session 11 = pivot complet.** On refactore avant tout deploy. Le Deploy frontend et le webhook retour Lexa→Pro glissent en session 12.

### Q2 — Canvas library : `react-flow` (décision structurelle, pas de benchmark)
Le whitepaper décrit exactement un modèle graph : comptes = nodes, transactions = edges animées, déclarations = clusters. react-flow v12 a tout ce qu'il faut : custom node renderers, edge animations, minimap, zoom, connection validation. tldraw est fait pour whiteboard libre type Miro — pas pour des nodes structurés métier.

```bash
npm install @xyflow/react  # react-flow v12
```

### Q3 — Architecture UI cible : **une seule route primaire `/workspace`**

Plus de Dashboard classique. `/workspace` contient :

- **Canvas hero (80% viewport)** : plan comptable spatial, comptes = nodes, transactions = edges animées, zoomable, custom node renderers Käfer
- **Chat conversationnel intégré** : bandeau bas ou overlay qui s'ouvre avec `cmd+k`. **Pas une route séparée. Pas une sidebar.** C'est l'interface primaire pour interroger les 3 agents (classifier/reasoning/tva).
- **Timeline bandeau bas (60px)** : scrubber temporel dans l'année fiscale, passé consolidé (vert), présent en cours (orange), futur prédit (gris pointillé)
- **Agents visibles** : les 3 agents sont des petites entités animées sur le canvas quand ils travaillent, **pas des routes séparées**

**Ledger.tsx actuel** → devient un toggle "mode expert" accessible depuis le workspace (icône calc en coin). Pas sa propre route. Le whitepaper §5 mentionne explicitement : *"Modes de vue togglable (Canvas défaut, Timeline, Documents, Conversations, Livres fallback)"*.

**Onboarding wizard** → reste tel quel (exception justifiée : first-run one-shot).

### Q4 — Dark mode : **refactor maintenant**

Le whitepaper est formel : "dark mode par défaut". Dark mode ne se bolt pas après, il s'architecture. Coût 1-2h maintenant vs 2 jours après 10 vues écrites en light.

Plan :
- Refactor `index.css` avec variables sémantiques CSS (`--bg-surface`, `--text-primary`, `--border-subtle`, etc.)
- Palette Tailwind OKLCH, class-based (`dark:`)
- Fonts : **Inter** (UI) + **JetBrains Mono** (données financières)
- Supprimer Fraunces (pas dans le whitepaper)

### Q5 — Fix bug mapping eCH-0097 dans swigs-workflow
**Oui, session 11, commit dédié 15 min.** Copier le mapping validé de `apps/backend/src/services/companyLookup.ts` (codes 0101/0106/0107/0108/0109/0110 validés live contre BFS) vers `swigs-workflow/backend/src/services/companyLookup.service.js`. Pas de risque, Pro a le même bug non-détecté.

### Q6 — Décisions ouvertes §10 whitepaper

- **Multi-tenant** : un user peut avoir N entités (whitepaper mentionne explicitement le mode fiduciaire multi-clients). **Refactor `companyStore` → `companiesStore` avec `activeCompanyId`.** Backend accepte déjà `tenantId` en requête, il faut le propager depuis le frontend. **Résout aussi la dette P3** identifiée session 10 (dashboard qui affichait encore le tenant seed).

- **Autonomie IA** : **toujours validation humaine en v1**. Pas de seuil d'auto-validation. On gagne la confiance en montrant traçabilité + citations + scores. Seuil < 50 CHF envisageable v2 après analyse des overrides. L'UI doit rendre la validation ultra-rapide (shortcuts clavier, une touche = valider).

- **Langue v1** : **FR uniquement**. Priorité VS confirmée session 02. DE/IT/EN en v1.5+. **Mais infra i18next posée dès session 11** : un seul `fr.json`, clés structurées, jamais de texte hard-codé dans le JSX. Coût marginal à l'écriture, gain énorme quand on ajoutera DE.

---

## Plan session 11 détaillé

**Si contexte plein** : couper en deux — session 11a (étapes 1-5) + session 11b (étapes 6-11).

### Étape 1 — Lecture whitepaper + north-star (15 min, OBLIGATOIRE)
```
00-vision/whitepaper.md     # toute la section 5 "Interface Layer"
00-vision/north-star.md     # les 6 principes "2 ans d'avance"
```
**Ne touche à AUCUN code avant d'avoir lu.**

### Étape 2 — Dark mode refactor (1h)
- `tailwind.config.js` : `darkMode: 'class'`, palette OKLCH (bg, surface, elevated, border, ink, muted, primary, success, warning, danger)
- `index.css` : variables sémantiques CSS, fonts Inter + JetBrains Mono (Google Fonts), suppression Fraunces
- Classes `.btn`, `.card`, `.input`, `.chip` refaites en variables sémantiques
- Application `class="dark"` sur `<html>` par défaut dans `main.tsx`

### Étape 3 — Multi-company store (30 min)
- Renommer `companyStore.ts` → `companiesStore.ts`
- State : `{ companies: Company[], activeCompanyId: string | null, add, remove, setActive }`
- `persist` localStorage (même clé `lexa.companies`)
- Propager `activeCompanyId` → `tenantId` dans `api/client.ts` (header `X-Tenant-Id` ou query param selon ce que le backend accepte — **vérifier `apps/backend/src/routes/` en premier**)
- **Résout dette P3 session 10** en même temps

### Étape 4 — Refactor routes (1h)
- Supprimer `routes/Dashboard.tsx` (fusionné dans Workspace)
- Supprimer `routes/Chat.tsx` (intégré dans Workspace)
- Nouvelle route primaire `/workspace` → `routes/Workspace.tsx`
- `Ledger.tsx` conservé mais **non monté comme route** — accessible via toggle depuis Workspace
- `Onboarding.tsx` conservé (first-run)
- `Home.tsx` : soit supprimée (redirect direct vers /workspace si company active), soit minimaliste

### Étape 5 — Canvas react-flow scaffold (2h)
```bash
cd apps/frontend && npm install @xyflow/react
```
- `components/canvas/Workspace.tsx` : ReactFlow container, 80% viewport
- `components/canvas/nodes/AccountNode.tsx` : custom node renderer pour comptes Käfer (code + libellé + solde + animation quand transaction passe)
- `components/canvas/edges/TransactionEdge.tsx` : edge animée avec montant + devise + TVA chip
- Layout auto : `dagre` ou `elkjs` pour positionner les nodes par catégorie (actifs gauche, passifs droite, charges bas, produits haut)
- Fetch données : `lexa.ledgerBalance()` → comptes, `lexa.ledgerList(500)` → transactions
- Minimap + controls zoom
- **Pas de menu contextuel complet encore** — juste l'affichage + interaction zoom/pan

### Étape 6 — Chat intégré workspace (1h)
- `components/chat/ChatOverlay.tsx` : overlay `cmd+k` (portal React, backdrop blur)
- Pills switch agents (reasoning/tva/classifier) — reprendre design session 10
- Historique conversation persisté session (zustand non-persist)
- Quand un agent répond, les nodes du canvas pulsent visuellement pour montrer les comptes concernés (liaison chat → canvas)

### Étape 7 — Timeline bandeau bas (1h)
- `components/timeline/FiscalTimeline.tsx` : 60px fixe en bas du workspace
- Scrubber de l'année fiscale (1 janvier → 31 décembre)
- Zones colorisées : passé consolidé (vert), présent (orange), futur prédit (gris pointillé)
- Click sur date → filtre les edges du canvas pour afficher les transactions de cette période
- Lecture depuis `lexa.ledgerList()` avec groupement temporel

### Étape 8 — Ledger = toggle mode expert (30 min)
- Bouton `icône calc` en coin du Workspace → ouvre `Ledger` en modal/overlay plein écran
- Le composant `Ledger.tsx` existant est réutilisé tel quel
- Shortcut clavier `cmd+shift+L` pour toggle rapide

### Étape 9 — Fix Pro mapping eCH-0097 (15 min, commit dédié)
- Copier le nouveau mapping (`0101/0106/0107/0108/0109/0110` + fallback `autre` + warn log) vers `~/CascadeProjects/swigs-workflow/backend/src/services/companyLookup.service.js`
- Rsync sur .59
- Commit dédié sur branche swigs-workflow (pas dans le commit Lexa)

### Étape 10 — Validation pont Pro→Lexa live (15 min)
```bash
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 500 --nostream | grep -iE "ingest|connectors/bank|pushTransactionToLexa"'
```
Chercher les POST `/connectors/bank/ingest` en provenance du cron IMAP de Pro (activé depuis session 10). Si rien, forcer un fetch IMAP manuel.

### Étape 11 — Commit + journal session 11 (30 min)
- Un commit principal `feat(frontend): session 11 — canvas workspace + dark mode + multi-tenant + chat intégré`
- Un commit séparé `fix(swigs-workflow): eCH-0097 legal form mapping alignment with BFS V5 reality`
- Journal `06-sessions/2026-04-14-session-11.md` structuré : décisions / réalisations / dérives corrigées / dette
- Mise à jour `INDEX.md` + `NEXT-SESSION.md` pour session 12

**Total estimé ~8h.** Session dense. Si contexte limite, split en session 11a + 11b (voir début du plan).

---

## Ce qui glisse en session 12

- Deploy frontend sur .59 (Nginx + path/subdomain + cert)
- Webhook retour Lexa→Pro (update `BankTransaction.lexaClassification`)
- Tests automatisés (qa-lexa, perf-lexa, corpus-validator)
- Modelfile `lexa-fiscal-pp` (déclaration PP Valais)
- Briefing quotidien proactif (agent `conseiller`)
- Multi-modal total : OCR photo/PDF, email forward, scan QR-facture

---

## Bilan sessions 06-10 — état stable à emporter

| Couche | État | Notes |
|---|---|---|
| 1. Knowledge | ✅ 5388 pts Qdrant | 5/5 lois fédérales, 4/4 ordonnances, Info TVA, VS, Käfer |
| 2. Data | ✅ event store + grand livre | 10 routes, 14 events, balance équilibrée |
| 3. Reasoning | ✅ 3 agents stables | classifier 10s, reasoning 7.4s, tva 6.9-10.6s |
| 4. Execution | ❌ pas commencé | templates déclaratifs — session 12+ |
| 5. Interface | ⚠️ scaffold tabulaire à refactorer | session 11 pivot canvas |

**Backend validations live (session 10)** :
- SWIGS SA via UID register BFS → onboardé E2E
- Agent TVA : "Taux standard ?" → LTVA art. 25 en 6.9s / "Repas affaires ?" → Art. 29 al. 2 en 10.6s
- Grand livre : 14 events, 7 comptes Käfer, CHF 13'103.80 balance équilibrée

**Fix bug critique session 10 (commité sur .59)** :
- Mapping `eCH-0097` BFS V5 corrigé : 0107=Sàrl (pas SCA), 0108=Coop (pas Sàrl), 0109=Association, 0110=Fondation. Validé live sur SWIGS SA / Kozelsky Sàrl / Migros-Genossenschafts-Bund / Croix-Rouge / Pierre Gianadda. **Le même bug existe dans swigs-workflow** → à corriger étape 9 session 11.

---

## Infrastructure actuelle

| Host | Service | Port | Status |
|---|---|---|---|
| **.59** | lexa-backend (Express TS + tsx watch) | 3010 | ✅ PM2, hot-reload via tsx |
| **.59** | Postgres 14.22 (base lexa) | 5432 | ✅ 3 migrations |
| **.59** | swigs-workflow (pont actif) | 3004 | ✅ PM2, **LEXA_ENABLED=true** |
| **.103** | Ollama (lexa-classifier/reasoning/tva) | 11434 | ✅ systemd |
| **.103** | llama-server BGE-M3 GPU | 8082 | ✅ systemd |
| **.103** | Qdrant (5388 pts) | 6333 | ✅ Docker |
| **local** | Frontend dev (Vite) | 5190 | pas encore deployé |

---

## Commits session 10 (local, non pushés)

```
5647848 docs(session-10): update NEXT-SESSION with smoke test results + dette technique P1-P4
1609b42 feat(frontend): session 10 — React 19 + Vite + Tailwind scaffold + onboarding wizard
```

**À pousser en début session 11** (après confirmation user). Un 3ème commit s'ajoutera pour le fix mapping eCH-0097 qui a déjà été **rsync sur .59** mais pas encore committé dans le repo Mac.

---

## Quick-start session 11 (copier-coller)

```bash
# 1. Lire le contrat (obligatoire, zéro code avant)
cat ~/CascadeProjects/lexa/00-vision/whitepaper.md | less      # section 5
cat ~/CascadeProjects/lexa/00-vision/north-star.md | less      # 6 principes

# 2. Sync repo
cd ~/CascadeProjects/lexa
git log --oneline -5     # vérifier commits 5647848, 1609b42
git status               # voir companyLookup.ts modifié non-committé (fix SARL)
git push origin main     # (après confirmation user)

# 3. Commit le fix mapping eCH-0097 (déjà déployé .59 en session 10)
git add apps/backend/src/services/companyLookup.ts
git add apps/frontend/src/api/types.ts apps/frontend/src/routes/Onboarding.tsx
git commit -m "fix(companyLookup): eCH-0097 legal form mapping alignment with BFS V5 reality"

# 4. Vérifier backend + pont actif
ssh swigs@192.168.110.59 'curl -s http://localhost:3010/health'
ssh swigs@192.168.110.59 'grep -E "^LEXA_" /home/swigs/swigs-workflow/.env'
ssh swigs@192.168.110.59 'pm2 logs lexa-backend --lines 200 --nostream | grep -iE "ingest|connectors/bank"'

# 5. Installer react-flow + attaquer étape 2 (dark mode)
cd apps/frontend && npm install @xyflow/react
```

---

## Avertissements importants

1. **LIRE LE WHITEPAPER D'ABORD.** Session 10 a dérivé parce que j'ai foncé sur le scaffold sans relire. Ne répète pas.
2. **Ne jette pas le scaffold existant.** TypeScript propre, flow onboarding validé E2E, tests chrome-devtools OK. Le refactor capitalise, il ne casse pas.
3. **Dark mode = architecture, pas bolt-on.** Fais-le étape 2 avant d'écrire une seule vue.
4. **Chat n'est PAS une route.** C'est un overlay `cmd+k`. Si tu crées `routes/Chat.tsx`, tu as raté.
5. **Ledger n'est PAS une route.** Mode expert toggle depuis Workspace. Si tu le mets dans le router, tu as raté.
6. **Multi-tenant depuis le départ.** `companiesStore` pluriel avec `activeCompanyId`. Pas de company singleton.
7. **Pas de texte hard-codé.** Toute string UI passe par `t('namespace.key')` depuis i18next `fr.json`.
8. **Sudo .59 `Labo`**, sudo Spark `SW45id-445-332`, password Postgres `~/.lexa_db_pass_temp`.

---

**Dernière mise à jour** : 2026-04-14 (fin session 10 + brief user refactor session 11)
