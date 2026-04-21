# Lane M — UI Fixes Workspace (2026-04-16)

## Contexte

2 fixes UI ciblés sur Workspace, sans refonte esthétique.

---

## Tâche 1 — Curseur timeline date du jour

**Constat** : `cursorDate` était déjà initialisé à `new Date()` dans Workspace.tsx (ligne 45). FiscalTimeline utilisait déjà `cursor = selected ?? now`. Le curseur était donc correctement positionné au jour J au chargement.

**Ajout** : micro-label `"aujourd'hui"` flottant au-dessus du curseur accent, visible uniquement quand `cursor.toDateString() === now.toDateString()`. Positionné en `-top-4`, classe `text-accent`, `text-2xs`.

Fichier modifié : `apps/frontend/src/components/timeline/FiscalTimeline.tsx`

---

## Tâche 2 — Réorganisation menu header Workspace

### 2a. "Grand livre" top-level

"Mode expert" retiré de `iaItems`. Bouton direct `<button className="btn-ghost">` ajouté dans la `<nav>` desktop après le dropdown IA. Même padding/typo que les dropdowns, sans chevron. Label : "Grand livre", icône : `Calculator`.

### 2b. Dropdown "Paramètres" retiré

`parametresItems` array supprimé. `NavDropdown` Paramètres retiré de la nav desktop. `mobileGroups` réduit à 3 entrées (Déclarations / Comptabilité / IA).

### 2c. Switcher client via logo top-left

Logo "L" + texte "Lexa" wrappés dans un `<button>`. Comportement :
- `hasMultipleClients === true` → ouvre/ferme `logoMenuOpen` (state local) avec menu déroulant listant les clients fiduciaires
- `hasMultipleClients === false` → `navigate('/')`
- Chevron visible uniquement si multi-clients, rotation 180° si ouvert
- Click en dehors ferme via `useRef` + `mousedown` listener

### 2d. Bouton logout visible

`<button>` avec icône `LogOut` (w-4 h-4) positionné après la `<nav>` desktop, `hidden md:flex`. Classes : `btn-ghost !px-2 !py-1.5 text-muted hover:text-danger transition-colors`. Tooltip `title="Déconnexion"`. Réutilise `handleLogout` existant.

### Mobile

`MobileMenu` reçoit `quickActions={mobileQuickActions}` avec "Grand livre" (Calculator) + "Déconnexion" (LogOut). Le groupe "Paramètres" n'existe plus dans `mobileGroups`.

---

## Fichiers modifiés

- `apps/frontend/src/routes/Workspace.tsx`
- `apps/frontend/src/components/timeline/FiscalTimeline.tsx`

## Deploy

- Build : `npm run build` — 0 erreur TypeScript, 0 warning
- rsync → `swigs@192.168.110.59:/home/swigs/lexa-frontend/` ✓
- Cross-apps smoke : Lexa + Swigs Pro titres OK ✓

---

## Critères vérifiés

- [x] Curseur timeline visible à position date du jour au chargement
- [x] "Grand livre" accessible en bouton top-level du header
- [x] Dropdown "Paramètres" retiré
- [x] Switcher fiduciaire accessible via logo top-left si memberships > 1
- [x] Bouton logout visible (icon LogOut)
- [x] Cross-apps verts (Lexa + Pro)
