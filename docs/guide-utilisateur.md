# Lexa — Guide utilisateur (1 page)

Bienvenue dans **Lexa**, votre comptabilité IA suisse 100% locale.
Ce guide couvre l'essentiel en 5 minutes.

---

## 1. Connexion

URL : **https://lexa.swigs.online**

- Identifiez-vous avec votre email + mot de passe
- Vous arrivez sur le **Workspace** de votre compte actif

Si vous gérez plusieurs comptes (perso + entreprise + clients fiduciaires), cliquez sur le **badge en haut à gauche** (avec votre nom/raison sociale) pour ouvrir le sélecteur :

- **Mes comptes** — la liste de vos comptes (PP, PM)
- **Portefeuille fiduciaire** — visible uniquement si vous gérez des clients en tant que fiduciaire
- **+ Ajouter un compte**

---

## 2. Vue d'ensemble — Workspace

Lexa adapte automatiquement l'interface selon le type de compte actif :

| Type de compte | Vue affichée |
|---|---|
| **Personne physique** (PP) — salarié, indépendant, association | 4 swimlanes : Salaire & revenus, Vie privée, Épargne & prévoyance, Obligations fiscales + swimlane **Crypto** |
| **Personne morale** (PM) — SA, Sàrl, Coopérative | Vue **Ledger** (plan comptable + balance) + 2 vues alternatives (Colonnes A/B) |

En haut du workspace, le **profil hero** affiche :
- Avatar + nom
- 4 KPI (Salaire / Vie privée / Épargne / Impôts) + **Disponible** mis en avant
- Bouton **↑ Importer** (en orange) pour démarrer un import

---

## 3. Importer des données (PP) — modal universel

Cliquez sur **↑ Importer** pour ouvrir le modal d'import.

### Drag & drop
Glissez-déposez n'importe quel document (PDF, JPG, PNG, max 10 MB) dans la zone : Lexa détecte automatiquement le type.

### Choix manuel par catégorie
6 cards disponibles :

| Catégorie | Quoi | Raccourci |
|---|---|---|
| **Salaire** (Swissdec) | Certificats de salaire — QR-code Swissdec lu nativement, fallback OCR | `W` |
| **Fortune** (Banques) | Relevés bancaires, extraits dépôts | `B` |
| **Placements** (Titres, fonds) | Portefeuilles d'investissement | `P` |
| **Frais** (Déductibles) | Notes de frais, factures pro | `F` |
| **Assurances** (3a / maladie) | Polices, primes | `A` |
| **Crypto** (Wallet) | Ouvre le formulaire wallet (chain + adresse) | `C` |

### Raccourcis modal
- **Esc** — ferme le modal
- **W / B / P / F / A / C** — sélectionne la catégorie correspondante
- Les raccourcis ne déclenchent pas si vous tapez dans un champ texte

### Workflow d'import
1. Upload → status **pending**
2. OCR + extraction IA → status **extracted** (~30 sec/doc)
3. Modal de validation s'ouvre — vous corrigez les valeurs si besoin
4. Validation → données injectées dans le wizard fiscal correspondant

Suivi en bas du modal : **Mes imports en cours** (cliquer pour déplier).

---

## 4. Wallets crypto

Dans la swimlane **Crypto** du workspace PP :

- **+ Ajouter wallet** : choisissez la chain (ETH / BTC / SOL), collez l'adresse, donnez un label
- **Refresh** : déclenche manuellement un snapshot du solde + prix CHF au 31.12
- **Cron annuel** : tous les 2 janvier, Lexa snapshot automatiquement vos wallets pour la déclaration fiscale (1 seul appel CoinMarketCap pour tous les symbols → quota préservé)

Sources de prix : **CoinMarketCap** (CHF) + balances Etherscan (ETH), Blockstream (BTC), Solana RPC (SOL).

---

## 5. Wizards fiscaux

Disponibles pour 7 cantons romands : **VS, GE, VD, FR, NE, JU, BJ (Jura bernois)**

Démarrer une déclaration depuis :
- Bouton **Simuler** dans le LexaInsight (PP)
- Card **Démarrer ma déclaration** dans l'empty state (premier login)
- Menu **Déclarations** dans la nav

Wizards disponibles : PP (Personne physique) ET PM (SA, Sàrl, Coopérative) pour chaque canton.

Le wizard est guidé en **6 étapes** : Identité → Revenus → Fortune → Déductions → Aperçu → Génération (PDF + XML eCH-0217).

---

## 6. Raccourcis clavier

| Raccourci | Action |
|---|---|
| `⌘K` (Mac) / `Ctrl+K` (Win) | Ouvre **Lexa CmdK** (chat IA fiscal avec contexte ledger) |
| `⌘⇧L` / `Ctrl+Shift+L` | Ouvre le **Grand livre expert** (mode comptable expert) |
| `Esc` | Ferme tout modal/popover |

---

## 7. Menu de navigation

| Item | Quoi |
|---|---|
| **Déclarations** | Wizards PP + PM par canton |
| **Comptabilité** | Plan comptable, transactions, classifications |
| **Documents** | OCR factures, CAMT.053, archives |
| **IA** | Lexa CmdK, agents spécialisés (TVA, Audit, Clôture) |
| **Grand livre** | Mode expert event-sourced, balance par compte |

---

## 8. FAQ rapide

**Mes données sont-elles privées ?**
Oui. L'IA tourne 100% en local sur les serveurs Swigs (DGX Spark NVIDIA GB10). Aucune donnée n'est envoyée à des tiers (sauf prix crypto via API CoinMarketCap, qui ne reçoit que les symbols ETH/BTC/SOL, jamais vos adresses).

**Que se passe-t-il si l'OCR rate un champ ?**
Le modal de validation vous montre les valeurs extraites en regard d'un champ éditable. Vous corrigez avant de valider. La confiance OCR globale est affichée (en %).

**Comment changer de canton ?**
Modifiez le canton dans les paramètres de votre compte (badge company → Paramètres). Le wizard fiscal s'adaptera automatiquement.

**Pourquoi mon montant Impôts diffère-t-il du total des items ?**
Lexa V1.3 affiche les **données API réelles** quand disponibles (ex: Obligations fiscales calculé en backend), et complète avec des **valeurs mock** pour les buckets non encore migrés. Le total Disponible reflète donc une estimation hybride.

**Un fichier ne s'uploade pas ?**
Vérifiez : format (PDF/JPG/PNG uniquement), taille (≤10 MB). Si le backend est en maintenance, un toast `Backend pas encore prêt — réessayez dans quelques minutes.` apparaît.

---

## 9. Support

- **Issue / bug** : ouvrez un ticket sur le repo interne Lexa
- **Questions fiscales spécifiques** : utilisez Lexa CmdK (`⌘K`) — réponses sourcées (LTVA, OLTVA, circulaires AFC)
- **Demande de canton supplémentaire** : contact équipe Swigs

---

*Version V1.3 — 2026-04-21 — Lexa Comptabilité IA Suisse*
