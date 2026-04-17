# Mobile Bugs Backlog — Session 3 Round 1B — 2026-04-17

Viewport testé : 375x812 (iPhone 13, devicePixelRatio 2, touch émulé)
Personas testées : PP (Jean Dupont QA / raison_individuelle / VS), PM (Test SA / sa / VS), Fidu (Fiduciaire QA Test / raison_individuelle / VS)

---

## BUGS NON-TRIVIAUX (reportés)

### BUG-MOB-01 — P1 — PeriodModal inaccessible sur mobile

**Persona** : Toutes (PP, PM, Fidu)

**Description** : Le bouton "Changer la période" dans la `FiscalTimeline` appelle `openModal()` du `periodStore`, mais le composant `PeriodModal` est monté exclusivement dans `LedgerCanvas.tsx`. Or `LedgerCanvas` est masqué sur mobile via `hidden md:block`. Résultat : cliquer sur la timeline en mobile n'ouvre aucune modal — aucun feedback visuel.

**Repro** :
1. Se connecter sur 375px
2. Cliquer sur le bandeau "Changer la période" en bas du workspace
3. Rien ne se passe

**Fix suggéré** : Déplacer le `<PeriodModal>` de `LedgerCanvas.tsx` vers `Workspace.tsx` (où il peut être monté en permanence), ou créer un composant wrapper `<PeriodModalPortal>` monté dans `App.tsx`.

**Fichiers concernés** :
- `apps/frontend/src/components/canvas/LedgerCanvas.tsx` (ligne 222)
- `apps/frontend/src/routes/Workspace.tsx` (à modifier pour accueillir la modal)
- `apps/frontend/src/stores/periodStore.ts`

**Effort estimé** : ~30 min

---

### BUG-MOB-02 — P2 — LedgerModal "Mode expert" : header dense sur mobile

**Persona** : Toutes

**Description** : La LedgerModal (`apps/frontend/src/components/ledger/LedgerModal.tsx`) s'affiche en `absolute inset-4` (343px large sur 375px). Sa header contient le toggle trimestriel/annuel, les selects année/trimestre, et le select méthode TVA — tout en ligne. Sur 375px ces éléments débordent ou se wrappent de manière chaotique. Le texte "Mode expert" et "Décompte TVA" s'écrasent.

**Repro** :
1. Ouvrir le menu burger sur mobile
2. Cliquer "Grand livre"
3. Observer la header de la modal

**Fix suggéré** : Séparer la header en 2 lignes sur mobile (`flex-col sm:flex-row`), masquer certains labels via `hidden sm:inline`.

**Effort estimé** : ~25 min

---

### BUG-MOB-03 — P2 — Fiduciaire : switcher client non testable sans multi-membership

**Persona** : Fidu

**Description** : Le switcher client (dropdown avec liste des clients fiduciaires) n'apparaît que si `fiduClients.length > 1`. Dans ce test QA, le compte fidu n'a qu'un seul tenant — le switcher ne s'affiche pas du tout. Impossible de valider visuellement le comportement mobile du switcher (icône Users, dropdown liste clients, badge mis à jour après switch).

**Impact** : Non reproductible sans données de fixture multi-tenant.

**Fix suggéré** : Ajouter des fixtures multi-tenant dans le script de seed QA, OU tester manuellement avec un vrai compte fiduciaire production.

**Effort estimé** : ~45 min (seed QA multi-tenant)

---

### BUG-MOB-04 — P3 — Timeline bouton touch-target à 40px (< 44px)

**Persona** : Toutes

**Description** : Le bouton `<button class="flex-1 relative h-10 ...">` de la FiscalTimeline mesure 40px de hauteur sur mobile. Le standard WCAG recommande 44px minimum. Le container externe (h-[60px]) compense partiellement (zone cliquable perçue plus grande), mais la zone de clic déclarée reste 40px.

**Fix suggéré** : Augmenter le container timeline à `h-[68px]` et le bouton à `h-12` (48px), ou ajouter un `padding-y` transparent pour étendre la zone de tap sans changer le visuel.

**Effort estimé** : ~10 min mais risque de casser le layout vertical du workspace (flex-col avec timeline fixe en bas)

---

## BUGS TRIVIAUX FIXÉS CETTE SESSION

| Bug | Fichier | Fix |
|-----|---------|-----|
| Logo button touch-target 24px | `Workspace.tsx` | Ajout `min-h-[44px]` |
| Badge company touch-target 30px | `Workspace.tsx` | Ajout `min-h-[44px]` |
| Burger button touch-target 28px | `MobileMenu.tsx` | Ajout `min-h-[44px] min-w-[44px]` |
| Groupes menu burger 44px (ok) mais items sous-menu 40px | `MobileMenu.tsx` | Ajout `min-h-[44px]` sur items expanded |
| Quick actions burger (Grand livre, Documents, Déconnexion) 32px | `MobileMenu.tsx` | Ajout `min-h-[44px] !py-2` |
| Bouton X fermeture PeriodModal 24px | `PeriodModal.tsx` | `p-2 min-h-[44px] min-w-[44px]` |
| Bouton X fermeture LedgerDrawer 24px | `LedgerDrawer.tsx` | `p-2 min-h-[44px] min-w-[44px]` |

---

## ÉTAT FINAL APRÈS PATCHES

| Check | PP | PM | Fidu |
|-------|----|----|------|
| Header no overflow horizontal | OK | OK | OK |
| Badge company lisible + truncate | OK (User icon) | OK (Building2 icon) | OK (User icon) |
| Badge chip canton visible | OK (VS) | OK (VS) | OK (VS) |
| Burger button accessible | OK (44px) | OK | OK |
| Menu burger groupes 44px | OK | OK | OK |
| Quick actions menu 44px | OK | OK | OK |
| Timeline visible | OK (60px) | OK | OK |
| PeriodModal sur mobile | FAIL (BUG-MOB-01) | FAIL | FAIL |
| Pas d'overflow horizontal | OK | OK | OK |
| StartActionCards lisibles | OK (grid-cols-1) | OK | OK |
| Icône persona correcte | OK (User=PP) | OK (Building2=PM) | OK (User=RI) |
