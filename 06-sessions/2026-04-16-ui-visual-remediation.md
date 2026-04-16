# Session UI Visual Remediation — Affichage Propre

**Date** : 2026-04-16
**Agent** : Sonnet 4.6
**Contexte** : User dit "aucune différence" après Lane H et "affichage le cheni"
**Scope** : `apps/frontend/**` uniquement

---

## Diagnostic honnête

### Ce que Lane H a effectivement changé

| Fix | Visible ? | Impact |
|-----|-----------|--------|
| `Controls/MiniMap` au-dessus de la timeline (+88px) | Subtil | Fonctionnel mais pas perceptible visuellement |
| `ChatSidebar` absolute au lieu de fixed | Non visible si sidebar fermée | Correct mais pas la cause du "cheni" |
| Fallback mobile "Vue comptable" | Visible mais... vide | A remplacé le canvas inutilisable par un écran vide passif |
| Badges hidden sur mobile | Non visible | Nettoyage technique |
| `FiscalTimeline` légende mobile hidden | Subtil | Légère amélioration |
| `TimelineBar` légende md hidden | Subtil | Légère amélioration |

**Conclusion Lane H** : fixes techniques corrects, mais n'ont pas adressé les vrais problèmes UX que l'user voit. Le fallback mobile créé était un **downgrade** : un écran vide avec texte passif au lieu du canvas.

### Ce que Lane H n'a PAS traité

1. **Le workspace mobile était vide** — juste "Vue comptable" + texte passif, 0 action accessible
2. **Le workspace desktop n'a pas de hiérarchie** — canvas comptable occupant tout, pas de navigation latérale, on ne sait pas quoi faire
3. **Le LedgerCanvas comme page d'accueil** — affiche des comptes Käfer (1020, 2200, 3200...) à un user qui vient juste se connecter

### Problèmes UX fondamentaux observés

**Hiérarchie visuelle** : Aucun titre H1 sur le workspace, pas de section claire, le canvas prend 100% de l'espace sans contexte.

**Densité / aération** : Le canvas est très aéré (trop vide sur desktop) mais sans structure visible. Sur mobile c'était du vide complet.

**Navigation confuse** : 4 dropdowns dans la top bar desktop (Déclarations / Comptabilité / IA / Paramètres) mais aucune entrée directe visible sur la page. Le user doit chercher dans les menus.

**Mobile inutile** : Après Lane H, mobile = icône réseau + texte passif. 0 action directe. Même un utilisateur averti devait passer par le burger menu.

### Hypothèse "cheni"

Le user voit "le cheni" parce que :
1. **Il arrive sur le workspace et voit des cases de comptes comptables (1020, 3200, etc.) éparpillées** sans savoir ce que c'est ni quoi faire
2. **Sur mobile, c'est complètement vide** — un icône réseau et un message passif
3. **Aucun CTA primary visible** pour démarrer une déclaration ou accéder à une fonction

---

## Audit avant (screenshots)

| Vue | Screenshot | Observation |
|-----|-----------|-------------|
| Workspace desktop 1920×1080 | `01-workspace-desktop-before.png` | Canvas comptable plein écran, nodes éparpillés, 0 hiérarchie, 0 CTA |
| Canvas IA desktop 1920×1080 | `02-canvas-desktop-before.png` | Fond sombre, nodes en arc, correct pour les experts |
| Documents desktop | `03-documents-desktop-before.png` | Propre, bien structuré, pas de problème |
| Taxpayer wizard | `04-taxpayer-wizard-before.png` | Bien structuré (hors scope fixes) |
| PM wizard | `05-pm-wizard-before.png` | Bien structuré (hors scope fixes) |
| Workspace mobile 375×812 | `06-workspace-mobile-before.png` | **VIDE** — icône réseau + texte passif |
| Canvas mobile 375×812 | `07-canvas-mobile-before.png` | Fallback "desktop requis" correct |

---

## Plan remediation

### Priorité 1 — Beta blockers

| Item | Fichier | Modif | Impact |
|------|---------|-------|--------|
| Workspace mobile vide | `Workspace.tsx` | Remplacer fallback par dashboard actions | **Très élevé** — mobile inutilisable |
| Workspace desktop sans hiérarchie | `Workspace.tsx` | Ajouter sidebar gauche navigation | **Élevé** — user ne sait pas quoi faire |

### Priorité 2 — Gêne forte

| Item | Fichier | Modif | Impact |
|------|---------|-------|--------|
| 0 CTA primary visible au chargement | `Workspace.tsx` | Sections avec boutons distincts PP/PM/Chat IA | Élevé |
| Pas de titre page | `Workspace.tsx` | H1 "Tableau de bord" sur mobile | Élevé |

### Priorité 3 — Nice to have (V1.1)

- Ajouter un mini-résumé financier dans la sidebar (ex: solde principal)
- Canvas workspace : afficher seulement les 5 comptes principaux par défaut
- Indicateurs de progression déclarations (% complété)
- Briefing quotidien "Top 3 actions"

---

## Fixes appliqués

### Fix 1 — Workspace mobile : dashboard avec actions directes

**Fichier** : `apps/frontend/src/routes/Workspace.tsx`

**Avant** : fallback `md:hidden` avec un seul icône Network + texte passif "Vue comptable / Utilisez le menu ci-dessus"

**Après** : Dashboard structuré avec :
- H1 "Tableau de bord" + sous-titre exercice + société
- Section "Déclarations" : boutons PP (VS) et PM (VS) avec icon, titre, description, flèche →
- Section "Comptabilité" : Documents OCR, Clôture continue
- Section "Intelligence artificielle" : Chat IA fiscal (accent/orange), Conseiller fiscal
- Scroll natif, touch targets ≥ 48px, pas de scroll horizontal

### Fix 2 — Workspace desktop : sidebar navigation + canvas secondaire

**Fichier** : `apps/frontend/src/routes/Workspace.tsx`

**Avant** : LedgerCanvas plein écran `absolute inset-0` + 2 badges flottants (Agents, Cmd+K)

**Après** :
- `aside w-56` gauche fixe avec sections : Agents actifs (3 dots), Déclarations (PP · VS, PM · VS), Comptabilité (Documents OCR, Clôture, Audit), IA (Chat IA · ⌘K en accent, Conseiller)
- `div flex-1` droit pour le LedgerCanvas — plus petit, contextualisé
- Suppression des 2 badges flottants redondants (l'info est dans la sidebar)
- Un seul hint discret Cmd+K en haut à droite du canvas

---

## Screenshots après

| Vue | Screenshot | Delta |
|-----|-----------|-------|
| Workspace desktop 1920×1080 | `01-workspace-desktop-after.png` | **Sidebar gauche visible** avec Agents actifs, PP, PM, Documents OCR, Clôture, Audit, Chat IA, Conseiller — Canvas LedgerCanvas à droite |
| Workspace mobile 375×812 | `06-workspace-mobile-after.png` | **Tableau de bord complet** avec 3 sections et 5 boutons d'action directs cliquables |

### Tableau avant/après

| Vue | Avant | Après | Fix |
|-----|-------|-------|-----|
| /workspace desktop | Canvas plein écran, 0 nav | Sidebar gauche + canvas | Fix 2 |
| /workspace mobile | Vide/passif | Dashboard actions | Fix 1 |
| /canvas desktop | Inchangé | Inchangé | Non touché (hors scope) |
| /taxpayer/2026 | OK | OK (non-régression) | — |
| /pm/vs/2026 | OK | OK (non-régression) | — |
| /documents | OK | OK (non-régression) | — |

---

## Non-régression

Routes vérifiées :
- `/workspace` — OK desktop + mobile ✓
- `/canvas` — OK (inchangé) ✓
- `/taxpayer/2026` — OK ✓
- `/pm/vs/2026` — OK ✓
- `/documents` — OK ✓
- `/login`, `/register` — non modifiées ✓

---

## Commits poussés

```
cad85de fix(frontend): Workspace — dashboard mobile + sidebar navigation desktop
```

---

## Dettes V1.1

1. **Canvas workspace** : afficher seulement top 5 comptes par défaut, reste en toggle
2. **Sidebar desktop** : ajouter indicateurs de progression (déclaration % complétée)
3. **Mobile** : ajouter la section Audit dans le dashboard mobile
4. **Briefing** : résumé financier dans sidebar (solde compte principal, dernière transaction)
5. **Déploiement** : documenter que le répertoire cible est `/home/swigs/lexa-frontend/` (pas `/home/swigs/swigs-workflow-frontend/`)

---

## Verdict

**Affichage propre : OUI** pour les vues Workspace mobile et desktop.

Le vrai problème n'était pas un z-index ou un overflow — c'était l'**absence de structure d'information** sur la page d'accueil.

Lane H avait créé un fallback mobile vide (ce qui était pire que le canvas inutilisable), et le desktop montrait un canvas comptable sans aucun guidage. Cette session remplace ces deux écrans par une navigation structurée et des CTAs directs.

---

## Note déploiement

**Répertoire Nginx lexa.swigs.online** : `/home/swigs/lexa-frontend/`  
(PAS `/home/swigs/swigs-workflow-frontend/` qui est pour swigs-workflow)

Commande correcte :
```bash
rsync -avz --delete apps/frontend/dist/ swigs@192.168.110.59:/home/swigs/lexa-frontend/
```
