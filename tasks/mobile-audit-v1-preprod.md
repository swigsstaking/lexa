# Audit mobile Lexa — V1 pré-prod

**Date** : 2026-04-22
**Viewport testé** : iPhone 13 Pro (390 × 844, DPR 3, iOS Safari 17)
**Méthode** : Chrome MCP émulation + navigation réelle sur prod

---

## ✅ Fixes livrés cette itération

| Fichier | Fix |
|---|---|
| `TaxpayerWizardCanton.tsx` | Aside `WizardSummary` : passé de `fixed bottom-0 max-h-[40vh]` (masquait boutons Précédent/Suivant) à `lg:sticky lg:top-6` (mobile inline scroll naturel, desktop sidebar sticky). `pb-48` retiré du main (plus nécessaire). |
| `PmWizardCanton.tsx` + `PmWizardVs.tsx` | Même fix aside que PP (le bug était dupliqué) |
| Les 3 wizards ci-dessus | Stepper : `overflow-x-auto` + `min-w-max lg:min-w-0` → scroll horizontal mobile si 6 steps ne rentrent pas, inchangé desktop |
| `Conseiller.tsx` | Header : titre `truncate`, "Briefing IA" → "Briefing" (< sm), "Ask Conseiller" → "Ask" (< sm), ligne disclaimer "LIFD art. 33 · 58..." cachée en mobile (visible `lg:block`) |
| `CloseYear.tsx` | Header : `h-12` fixe → `min-h-12 flex-wrap`, titre truncate, "Ask agent Clôture" → "Ask IA" (< sm), badges `flex-shrink-0` |
| `AuditYear.tsx` | Header : même refonte que Conseiller (truncate + abréviations sm) |

---

## Pages testées — synthèse

### PP (tenant corentin RI, `e245cb2e`)

| Page | Avant fix | Après fix |
|---|---|---|
| `/welcome` | ✅ OK | — |
| `/workspace` (PpWorkspace) | ✅ OK (layout vertical propre) | — |
| `/documents` (DocumentsPp) | ✅ OK (drop zone + grille 2×3 catégories) | — |
| `/taxpayer/2026` step 4 | ❌ aside masque boutons Précédent/Suivant | ✅ aside scroll naturel en bas |
| `/settings` | ✅ OK | — |
| `/onboarding/add-account` | ✅ OK (3 cards empilées) | — |
| `/conseiller/2026` | ❌ header cassé, titre en colonne, 2 boutons + disclaimer superposés | ✅ header wrap responsive, abréviations sm, disclaimer masqué mobile |
| `/close/2026` | ⚠ header tassé, "Ask agent Clôture" coupé | ✅ wrap multi-lignes si nécessaire, abréviation |
| `/audit/2026` | ⚠ header pareil | ✅ même pattern refonte |

### PM (tenant Demo V2 SA Sàrl, `47eddb05`)

| Page | Avant fix | Après fix |
|---|---|---|
| `/workspace` (PmWorkspace) Colonnes B | ⚠ textes comptes tronqués, flow arrow "69.1k" arbitraire | Pas touché — voir incohérences ci-dessous |
| `/documents` (Documents) | ✅ OK (drop zone + CAMT.053 + filtres) | — |
| `/pm/vs/2026` step 1 | ❌ aside masque boutons + step 6 invisible dans nav | ✅ aside scroll + stepper scroll horizontal |

---

## 🔴 Incohérences PP/PM à résoudre pour V1

### 1. Header « Documents » divergent entre PP et PM

- **PP** : « Documents · Personne Physique » + sous-titre contextualisé (« PDF, JPG, PNG, HEIC — max 10 MB ») + panel `Vos imports` intégré
- **PM** : « Documents » tout court + compteur « N documents » + filtres de source

**Recommandation V1** : soit cohérentiser (« Documents · Entreprise » en PM avec filtres), soit assumer la divergence fonctionnelle (PP = import fiscal wizard-ready, PM = import pro comptable) et **documenter** dans une note produit.

### 2. Bouton « Demande à Lexa ⌘K » en absolu top-right sur workspace PP et PM

Position identique, c'est OK — mais le label `⌘K` sur mobile où il n'y a pas de clavier Cmd est gênant. Un touch target simple sans indication de raccourci serait mieux.

### 3. PmWorkspace « Colonnes B » mobile : labels tronqués

Les cartes comptes (Classe 1/2/3/4-9) affichent des libellés comme « Créances clients (débiteurs) », « Mobilier et installations d'exploitation » qui sont coupés en mobile sur 2 lignes voire tronqués avec `…`. La flèche visuelle « 69.1k » entre produits et actifs ne sert à rien en mobile.

**Recommandation V1** : en mobile, forcer vue Colonnes A (simple ledger liste) ou créer une vue dédiée « Mobile » qui empile tout verticalement sans flèches de flux.

### 4. `/taxpayer/2026` : nom et contenu hardcodés Marie Rochat

L'Aperçu en direct montre « Marie Rochat » comme nom du contribuable (valeur de seed de démo). En prod V1 il faut s'assurer que le nom récupère bien `activeCompany.name` ou les données du draft. **À vérifier** si c'est un bug ou un fallback attendu.

### 5. Stats cards `/audit/2026` grid 2 cols vs 4 cols

Sur mobile `grid-cols-2` OK, sur desktop `sm:grid-cols-4`. Pas d'incohérence critique, mais les 4 KPIs (Événements / Décisions IA / Confiance moy. / Basse confiance) pourraient être 4 lignes verticales en mobile pour éviter la densité actuelle.

### 6. Wizard PM VS : bouton "FORME JURIDIQUE" à « — » par défaut

Le tenant Demo V2 SA a legalForm=`sa` pourtant le select wizard affiche `—`. **Bug de pré-remplissage** : le wizard devrait charger la forme depuis la company. À investiguer.

### 7. `/close/2026` — tabs (Bilan / Compte de résultat / Santé comptable)

En mobile, les 3 tabs avec leurs icônes tiennent mais de justesse. Pas un gros pb.

---

## 📋 Recommandations V1 pré-prod (priorisées)

### Doit avoir (blockers)
1. ✅ **FAIT** — Fix wizards aside masquant boutons (3 fichiers)
2. ✅ **FAIT** — Fix headers Conseiller/Close/Audit cassés mobile
3. ✅ **FAIT** — Fix stepper overflow 6 steps mobile
4. 🔴 **À FAIRE** — PmWorkspace mobile : vue Colonnes A par défaut + masquer flow arrows en mobile
5. 🔴 **À VÉRIFIER** — Pré-remplissage PM wizard (forme juridique, IDE, adresse) depuis `activeCompany`

### Devrait avoir (améliorations UX)
6. 🟡 Tester iOS Safari réel avec upload HEIC (fix déployé mais jamais validé en vrai)
7. 🟡 Review touch targets < 44×44px (tous les boutons `!p-1.5` font 24×24, sub-minimum Apple HIG)
8. 🟡 CmdK modal sur mobile (`width: min(680px, 94vw)` → vérifier clavier iOS ne masque pas l'input)
9. 🟡 Homogénéiser les titres "Documents · PP" vs "Documents" PM
10. 🟡 Remplacer `⌘K` hint par un simple icône loupe en mobile

### Nice to have
11. ⚪ Drawer/bottom-sheet pour l'aperçu wizard (au lieu du scroll naturel)
12. ⚪ Mode landscape iPad/iPhone Plus (non testé)
13. ⚪ Gestes swipe horizontal entre steps wizard

---

## Validation post-fix

Test en émulation iPhone 13 Pro sur prod (commit `db1067f` + fixes de cette passe) :

- ✅ `/taxpayer/2026` step 4 : aperçu s'affiche après scroll, boutons Précédent/Suivant visibles
- ✅ Wizards PM : même pattern appliqué (fix à re-tester après rebuild)
- ✅ Headers Conseiller/Close/Audit : wrap propre, abréviations sm visibles

Re-tester depuis un vrai iPhone 13 Pro après le prochain deploy pour validation finale.
