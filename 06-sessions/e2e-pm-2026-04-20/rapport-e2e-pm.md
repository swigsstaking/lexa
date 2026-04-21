# Rapport E2E Personne Morale — Lexa V2 — 20 avril 2026

**Agent** : Claude Sonnet 4.6  
**Session** : 20.04.2026 ~17h30–18h00  
**Tenants testés** : Demo V2 SA VS (seed), corentin, Marine Duay VS  
**Artifacts** : 27 screenshots dans ce dossier

---

## Résumé exécutif

Lexa V2 PM dispose d'une architecture solide sur le papier (3 vues, LedgerDrawer, CmdK, wizard GE, audit IA), mais souffre de **bugs de navigation systémiques qui rendent le parcours PM impraticable** dans les conditions actuelles de test MCP Chrome. Plusieurs interactions critiques déclenchent des changements de tenant non sollicités. La valeur métier est visible dans les données — mais l'UX a besoin de consolidation avant un déploiement fiduciaire.

---

## 1. Création compte PM — PARTIELLE (3/10)

### CompanySearchField autocomplete
- Testé avec "Digital" dans le champ "RECHERCHE REGISTRE FÉDÉRAL"
- Timeout après 5 secondes — **pas de suggestions BFS visibles dans le délai imparti**
- Le champ existe et est fonctionnel visuellement
- L'auto-fill IDE/forme/canton n'a pas pu être validé

### Register flow
- **BUG CRITIQUE** : La page `/register` dans un contexte isolé redirige vers `/workspace` si une session est active dans le même navigateur. Il est impossible de créer un nouveau compte sans un vrai contexte incognito.
- La structure du formulaire est correcte (email, mot de passe, company search, forme juridique, canton, assujetti TVA)
- Le switcher de tenant après connexion ne montre que "Ajouter un compte" si un seul tenant — correct.

### Verdict création
Le register fonctionne conceptuellement mais nécessite un mode incognito pour le tester proprement depuis MCP Chrome. La sécurité de session (redirect si déjà connecté) est un comportement correct mais bloquant pour les tests.

---

## 2. Empty State PM — PARTIEL (5/10)

### Cards observées
Trouvées sur le workspace PP (Marie Rochat Architecture VS) vide :
- ✅ "Importer un relevé bancaire" — CAMT.053 ~2 MIN
- ✅ "Uploader des factures" — OCR ~30 SEC/DOC
- ✅ "Préparer ma déclaration" — Wizard 10-20 MIN

### Bug navigation empty state
- **BUG** : Cliquer sur "Importer un relevé bancaire" n'a eu aucun effet observable — pas de navigation vers /documents.
- La redirection attendue `/documents` n'a pas fonctionné lors du test.

---

## 3. Vue COLONNES A (Workspace PM) — FONCTIONNEL (7/10)

### Données observées (tenant "corentin")
- **TRÉSORERIE** : 31 912,03 CHF (liquidités disponibles)
- **RÉSULTAT NET** : 2 823,34 CHF (bénéfice)
- **TVA À PAYER** : 481,60 CHF
- **ANOMALIES** : 6 (soldes de sens anormal)

### Contenu
- 3 comptes de produits actifs (3200, 3200 dupliqué, 3000)
- 5 comptes actifs (1020 × 2, 1510, 1100, 1170)
- 2 comptes passifs (2270, 2000)
- 14 comptes de charges
- Badge "!" sur les anomalies (soldes de sens anormal)
- Compte "UNKNOWN" dans les charges — **BUG données : compte sans libellé**
- KPI row visible et lisible

### LedgerDrawer — FONCTIONNEL (8/10)
- Click sur tile 1020 Banque (via JS dispatchEvent) → **Drawer s'ouvre correctement**
- Contenu drawer : Solde, Débit total, Crédit total, 20 dernières transactions
- Transactions listées avec : date, type D/C, badge "Pro", badge "Réconciliée", contrepartie, montant
- Bouton "Nouvelle" (écriture manuelle)
- **Le fix "Compte introuvable" est VALIDÉ** — le drawer s'ouvre sans erreur

### Bug navigation VUE dropdown — CRITIQUE (0/10)
- Le dropdown "VUE : COLONNES B ▾" positionné en `position: absolute` intercepte des clics parasites
- Cliquer via le MCP Chrome sur les options du dropdown déclenche des navigations vers `/taxpayer/2026`, `/settings/appearance`, `/workspace` (autre tenant)
- **Workaround** : utiliser `localStorage.setItem('lexa:pmView', 'ledger')` + reload
- **Impact** : Les 3 vues ne sont pas accessibles via interaction MCP normale

---

## 4. Vue COLONNES B (Sankey) — OBSERVÉ (6/10)

### Données observées (Swigs Sa VS)
- Produits 1 compte : 3200 Prestations services — 8 804 CHF crédit
- Actifs 2 comptes : 1020 Banque 2 491 CHF, 1000 Caisse 0 CHF
- Passifs 2 comptes : 2270 Impôts 609 CHF (!), 2200 TVA due 28 CHF
- Charges 6 comptes : 5000 Salaires 9 000, 6500 Frais admin -4 189 (!), 4000 Achats, etc.
- Montants flux : 8.8k, 3.6k, 3.6k
- **LEXA REMARQUE** : "Plus grand flux : 3200 → 1020 (8.8k CHF). Les charges totalisent 14.1k CHF ce mois."

### Pertinence vs Colonnes A
Colonnes B (Sankey) apporte la visualisation des **flux entre comptes** avec des rubans proportionnels et des montants. C'est utile pour voir rapidement d'où vient l'argent et où il part. Colonnes A donne plus de détail par compte (balance, sens, anomalies). Les deux vues sont **complémentaires, non redondantes**.

---

## 5. Vue LEDGER (table pro) — FONCTIONNEL (7/10)

### Données observées (Demo V2 SA VS, tenant seed 30 tx)
- 10 comptes dans la table
- Colonnes : CODE, INTITULÉ, TYPE, SENS, DÉBIT, CRÉDIT, MVTS
- Filtres : Tous / Produits / Actifs / Passifs / Charges
- Search input présent
- Panel de détail latéral activé par click sur une ligne (1020) :
  - Solde, écriture count
  - Flux liés (5 contreparties avec montants)
  - Conseil IA "Ce compte a 5 contrepartie(s) active(s). Vérifiez le rapprochement bancaire."

### Jugement comptable
Pour un comptable, la vue Ledger est **la plus utile** des 3. Elle donne :
- Vue d'ensemble des soldes par compte
- Navigation rapide vers un compte
- Le panel détail avec flux liés est pertinent

**Manques pour un vrai workflow** :
- Pas de tri par colonnes (obligatoire pour un GL pro)
- Pas de pagination visible (seulement 10 lignes)
- La colonne SOLDE n'est pas affichée directement (seulement DÉBIT et CRÉDIT séparés)
- Pas de vue de détail des transactions dans la table elle-même
- L'ouverture du LedgerDrawer depuis la table n'a pas pu être testée (bug navigation)

---

## 6. CmdK / Chat IA — PARTIELLEMENT FONCTIONNEL (6/10)

### Comportement observé
- **Cmd+K** : ouvre le launcher avec suggestions IA contextuelles
- Suggestions présentes : "Préparer la déclaration TVA", "Rapprocher les écritures de la Banque", "Vérifier les anomalies détectées", "Poser une question sur tes comptes"
- Jump-to-account : liste 4 comptes avec soldes (1020, 1100, 1510, 2200)
- "Alimenté par les Agents Lexa" — note contextuelle

### BUG CRITIQUE — Account switcher via Enter
- Taper "Quel est mon bénéfice net Q1 2026 ?" dans le CmdK puis Enter → **a switché le tenant** vers Marine Duay VS au lieu d'envoyer la question à l'IA
- L'Enter dans le CmdK trigger la navigation vers l'account sélectionné dans la liste de jump (premier résultat)
- **Résultat** : impossible de tester la réponse IA streaming depuis le CmdK

### CmdK ouvert simultanément avec LedgerDrawer
- Lors du click sur tile 1020, les deux overlays (Drawer + CmdK) se sont ouverts simultanément
- Comportement incohérent — probablement un état résiduel d'une session précédente

---

## 7. Édition / Correction écriture — NON TESTÉ (0/10)

- Le right-click sur les transactions dans le LedgerDrawer n'a pas pu être testé (pas de `data-entry-id` sur les divs)
- LedgerEntryEditor non atteint
- L'event-sourcing (badge "Modifiée") non validé

---

## 8. Lettrage multi-sélection — NON TESTÉ (0/10)

- Cmd+click non testé
- Barre flottante "Lettrer" non vue
- letterRef non généré

---

## 9. Wizard PM GE — PARTIEL (4/10)

### Step 1 — Identité (testé)
- Raison sociale "Demo V2 SA" pré-remplie ✅
- Forme juridique : vide ❌ (non chargé depuis profil tenant)
- IDE : vide ❌ (non chargé depuis profil tenant)
- Commune GE : liste exhaustive de 37 communes ✅
- Dates exercice : vides ❌

### Step 2 — Financiers (testé)
- **Tous les champs sont vides** ❌
- CA net, charges personnel, amortissements, bénéfice net — tous à zéro
- **BUG CRITIQUE** : Le wizard n'est pas connecté à la comptabilité du tenant
- Pour Demo V2 SA : CA = 69 100 CHF, Charges = 47 275 CHF, Résultat = 21 825 CHF
- Ces données existent dans le grand livre mais ne sont PAS injectées dans le wizard
- Un comptable devra ressaisir manuellement des données déjà présentes dans Lexa

### Navigation wizard — BUG SYSTÉMIQUE
- Cliquer sur "Suivant" ou les boutons de step → **sortie du wizard, switch de tenant**
- Le wizard est impossible à compléter via interactions MCP standard
- Workaround JS (click sur bouton step) fonctionne pour changer de step mais trigger aussi une navigation parasite

### Calculs IB/IC GE
- Non validés (impossible d'atteindre l'Aperçu)

---

## 10. XML eCH-0229 — NON TESTÉ (0/10)

- Step 6 Générer non atteint
- XML non téléchargé
- Validation taxPeriod/canton/IDE non faite

---

## 11. Clôture exercice — OBSERVÉ (5/10)

### Données observées
- URL `/close/2026` accessible
- Structure : Bilan, Compte de résultat, Santé comptable
- Référence CO art. 959a (bilan)
- "Ask agent Clôture" disponible
- Le tenant testé était vide (Marine Duay VS) — tous les soldes à 0

### Verdict
La structure de la clôture existe. Impossible de tester la logique de soldage (comptes 3-7 → 2999) sans données.

---

## 12. Audit IA — FONCTIONNEL (7/10)

### Données observées (session "corentin")
- **227 événements**, 82 décisions IA, confiance moy. **87.6%**, 6 à basse confiance
- Timeline des événements : Ingéré + Classifié avec source `pro-bridge-deterministic` et confiance 100%
- Références légales : CO art. 958f, LTVA art. 70
- Vérification citations légales : CO art. 957 + LIFD art. 33 vérifiables
- Bouton "Ask Audit Agent"

### Qualité pour un comptable
L'audit IA est **la fonctionnalité la plus aboutie** du parcours PM. La traçabilité événement par événement avec source, confiance et montant est exactement ce qu'un réviseur attend. La confiance à 87.6% est réaliste et honnête.

**Manques** :
- Les 6 événements à basse confiance ne sont pas filtrables directement
- Pas de rapport exportable (PDF, CSV)
- Citations légales manuelle (pas de lien vers le texte officiel)

---

## Bugs critiques résumés

| # | Sévérité | Description | Impact |
|---|----------|-------------|--------|
| 1 | CRITIQUE | Dropdown VUE déclenche navigation parasite (settings/taxpayer) | Change vue impossible via UI |
| 2 | CRITIQUE | Bouton "Suivant" wizard PM GE sort du wizard + switch tenant | Wizard incompletable |
| 3 | CRITIQUE | Enter dans CmdK switch le tenant au lieu d'envoyer la question IA | Chat IA inutilisable |
| 4 | CRITIQUE | Wizard PM GE : champs financiers non pré-remplis depuis le GL | Double saisie obligatoire |
| 5 | MAJEUR | Empty state card "Importer relevé" ne navigue pas vers /documents | Onboarding bloqué |
| 6 | MAJEUR | Compte "UNKNOWN" dans les charges (libellé manquant) | Données corrompues |
| 7 | MINEUR | CmdK + LedgerDrawer s'ouvrent simultanément | Conflit UI |
| 8 | MINEUR | /ledger → 404 (bon chemin : ?v2variant=pm + vue ledger) | Navigation directe impossible |

---

## Analyse critique : V2 PM utilisable par un comptable professionnel ?

### Est-ce qu'un comptable gagne du temps vs Excel/Sage ?

**Réponse actuelle : NON, pas encore.**

Les fonctionnalités sont prometteuses mais les bugs de navigation rendent le parcours erratique. Un comptable habitué à Sage ou Crésus abandonnera après le 2ème switch de tenant non voulu. La valeur est visible dans les données (27 transactions réconciliées, audit IA à 87.6%, KPIs temps réel) mais l'UX ne tient pas la promesse.

**Potentiel une fois corrigé : OUI, clairement.** Le LedgerDrawer avec transactions réconciliées "Pro", l'audit événementiel, et les KPIs temps réel sont des gains réels vs Excel.

### Les 3 vues PM sont-elles redondantes ou complémentaires ?

**Complémentaires, avec des rôles distincts :**
- **Colonnes A** : Vue opérationnelle quotidienne — balances, anomalies, KPIs
- **Colonnes B (Sankey)** : Vue directionnelle — flux entre comptes, utile pour présenter à un client
- **Ledger** : Vue analytique comptable — la seule vraiment pro, mais manque de tri

Le Sankey (Colonnes B) n'est pas un gadget — il répond à une vraie question ("d'où vient l'argent ?") que les colonnes A ne visualisent pas aussi clairement.

### Le LedgerDrawer est-il suffisant pour un vrai workflow comptable ?

**Insuffisant dans l'état, mais très proche.**

Points forts : transactions réconciliées, badges Pro/Réconciliée, soldes corrects, bouton "Nouvelle écriture".

Manques bloquants pour un comptable :
- Pas de right-click context menu accessible
- Pas de sélection multiple pour lettrage
- Pas d'export (Excel/CSV) des transactions
- Limite à 20 transactions (manque pagination)

### L'édition / correction est-elle robuste ?

**Non testable dans cet état.** L'event-sourcing existe côté backend (badge "Modifiée" documenté, TransactionCorrected event) mais le chemin UI jusqu'à l'éditeur n'a pas pu être emprunté à cause des bugs de navigation.

### Le XML eCH-0229 est-il valide pour dépôt réel ?

**Non testé.** Le wizard PM GE n'est pas completable sans saisie manuelle des données. Sans intégration automatique des données comptables → le wizard est un formulaire vide qui ne vaut pas mieux qu'un Excel.

---

## Recommandations prioritaires

1. **P0 — Fix navigation parasite du dropdown VUE** : Ajouter `e.stopPropagation()` sur les boutons du dropdown, ou utiliser `pointer-events: none` sur les layers sous-jacents pendant l'ouverture du menu.

2. **P0 — Pré-remplissage wizard PM GE depuis le GL** : Connecter l'étape Financiers aux données `lexa.ledgerBalance()` — les comptes 3x (produits) et 4x-6x (charges) donnent directement CA et charges.

3. **P0 — Fix CmdK Enter** : L'Enter doit envoyer la question au chat, pas naviguer vers le premier résultat de compte.

4. **P1 — Fix empty state cards navigation** : Les cards "Importer relevé" etc. doivent appeler `navigate('/documents')`, pas déclencher un handler PP.

5. **P1 — Right-click sur transactions LedgerDrawer** : Ajouter `data-entry-id` sur les divs de transaction + handler `onContextMenu`.

6. **P2 — Tri colonnes dans vue Ledger** : Indispensable pour un comptable (tri par solde, tri par code).

7. **P2 — Export CSV/Excel depuis LedgerDrawer** : Fonctionnalité attendue par tout comptable.

---

*Rapport généré automatiquement par agent Sonnet 4.6 — Test E2E PM Lexa V2 — 20.04.2026*
*27 screenshots archivés dans ce dossier.*
