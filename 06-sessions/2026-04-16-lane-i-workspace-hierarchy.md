# Lane I — Workspace Hiérarchie Typographique

**Date** : 2026-04-16
**Agent** : Sonnet 4.6 (Lane I)
**Scope** : Hiérarchie typo + espacement cards existantes `/workspace`

## Screenshots avant/après

| Viewport | Avant | Après |
|----------|-------|-------|
| Desktop 1920×1080 | `workspace-before-desktop.png` | `workspace-after-desktop.png` |
| Mobile 375×812 | `workspace-before-mobile.png` | `workspace-after-mobile.png` |

## Problèmes identifiés (audit)

1. **AccountNode — solde trop petit** : `text-sm font-semibold` sur le solde le rendait identique visuellement au label du compte. La donnée clé devait dominer.
2. **AccountNode — espacement insuffisant** : Le séparateur entre en-tête et solde avait `mt-2 pt-2` — trop serré.
3. **AccountNode — largeur min insuffisante** : `min-w-[220px]` causait des coupures sur les montants à 6 chiffres avec `text-base`.
4. **Mobile fallback — titre trop petit** : "Vue comptable" en `text-sm font-medium` n'avait pas d'autorité visuelle — impossible de distinguer titre vs description.
5. **FiscalTimeline — année peu proéminente** : "2026" en `text-sm` se fondait dans la légende.
6. **Floating overlays — labels trop petits** : "AGENTS" en `text-2xs` et les dots `w-1.5 h-1.5` étaient à peine visibles.

## Fixes appliqués

| Problème | Fichier | Avant | Après |
|----------|---------|-------|-------|
| Solde AccountNode | `AccountNode.tsx` | `text-sm font-semibold` | `text-base font-semibold` |
| Espacement AccountNode | `AccountNode.tsx` | `mt-2 pt-2` | `mt-2.5 pt-2.5` |
| Largeur min AccountNode | `AccountNode.tsx` | `min-w-[220px] py-3` | `min-w-[240px] py-3.5` |
| Titre mobile fallback | `Workspace.tsx` | `text-sm font-medium` | `text-lg font-semibold` |
| Description mobile | `Workspace.tsx` | `text-xs text-muted` | `text-sm text-muted max-w-xs` |
| Icône mobile | `Workspace.tsx` | `w-10 h-10` | `w-12 h-12` |
| Gap mobile fallback | `Workspace.tsx` | `gap-4 p-6` | `gap-5 p-8 space-y-2` |
| Année FiscalTimeline | `FiscalTimeline.tsx` | `text-sm font-semibold` | `text-base font-semibold` |
| Label "Agents" overlay | `Workspace.tsx` | `text-2xs uppercase` | `text-xs font-medium uppercase` |
| Dots agents overlay | `Workspace.tsx` | `w-1.5 h-1.5` | `w-2 h-2` + `gap-1.5` |
| Label Cmd+K overlay | `Workspace.tsx` | `text-2xs text-muted` | `text-xs text-muted` |

## Contraintes respectées

- **0 nouveau composant créé**
- **0 nouveau fichier .tsx**
- **Pas de nouvelle structure de layout**
- **Pas de sidebar ajouté**
- **Header nav intouché** (Lane B)
- **Documents.tsx intouché** (Lane J)
- **Backend intouché** (Lane J)

## Non-régression cross-apps

- `https://lexa.swigs.online/` → `<title>Lexa · Comptabilité IA suisse</title>` ✓
- `https://workflow.swigs.online/` → `<title>Swigs Pro — Projets, heures et factures tout-en-un</title>` ✓
- Rsync vers `/home/swigs/lexa-frontend/` (NON vers swigs-workflow-frontend) ✓
