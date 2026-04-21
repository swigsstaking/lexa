# Rapport E2E Fiduciaire — Lexa V2
**Date** : 2026-04-20  
**Compte test** : qa-test@lexa.test  
**Tenants** : corentin (PP), Swigs Sa (SA), Demo V2 SA (SA), Marine Duay  
**Agent** : Claude Sonnet 4.6

---

## SYNTHÈSE

Le parcours fiduciaire multi-clients de Lexa V2 est **partiellement fonctionnel**. L'infrastructure RLS backend est solide, la sécurité API correcte, le CompanySearch excellent. Mais l'UX du switch tenant est cassée : le changement de client sans reload laisse des états stale dans React Query, affiche des données du mauvais tenant et génère des navigations aléatoires. Pour un outil professionnel gérant les données comptables de plusieurs clients, c'est bloquant.

---

## TEST 1 — Login fiduciaire

**Résultat : BUG de login frontend, contourné**

Le formulaire de login sur `/login` redirige vers `/register` quand l'email est saisi — comportement observé systématiquement. Cause probable : la logique de détection "compte existant vs nouveau" se déclenche avant la soumission du formulaire.

Après investigation : l'API `/api/auth/login` fonctionne parfaitement (200 OK, JWT avec 4 memberships). Le bug est purement frontend — la soumission via Enter déclenche la navigation vers register au lieu d'appeler l'API de login.

**Workaround utilisé** : clic explicite sur le bouton "Se connecter" (pas Enter). Fonctionne.

JWT post-login contient bien les 4 memberships dans le claim :
```
memberships: [e245cb2e, 72caa79c, 47eddb05, 276aa99e]
```

---

## TEST 2 — Dropdown multi-clients

**Résultat : FONCTIONNEL (avec réserves)**

Dropdown ouvert sur le badge tenant en haut à gauche. Les 4 tenants sont bien listés + bouton "Ajouter un compte". La liste est correctement alimentée par `/api/fiduciary/clients` (200 OK).

**Bug observé** : Premier clic sur un item du dropdown (Demo V2 SA) a switchté sur "corentin" au lieu — race condition entre fermeture du menu et click handler, les UIDs du menu se régénèrent avant le clic.

**Bug observé** : Après switch via clic dropdown, le badge se met à jour mais le workspace n'est pas rechargé avec les nouvelles données. Les données affichées restent celles du tenant précédent (React Query stale cache).

---

## TEST 3 — Vue workspace par client

### corentin (PP)
- Vue swimlanes PP correcte : Salaire 116 500 CHF, Vie privée 48 600, Épargne 18 456, Impôts 19 200, Disponible 30 244
- Isolation des données PM non visible : PASS

### Swigs Sa (SA)
- Vue COLONNES B (PM) : Produits 8 804, Actifs 2 490, Passifs 581, Charges 5 731
- 9 comptes actifs
- BUG : compte `UNKNOWN` dans les charges (libellé non mappé en base)

### Demo V2 SA (SA)
- Vue COLONNES A (PM) : Trésorerie 5 165, Résultat Net 21 825, TVA 4 190, 2 anomalies
- 30 transactions (confirmé API : 30 entries via /api/ledger?limit=1)
- Dataset cohérent : Factures Acme, TechStart, GammaCorp, etc.
- BUG : compte `UNKNOWN` dans les charges (même problème)

### Marine Duay
- Workspace vide correctement affiché (0 CHF partout)
- Détection PM (COLONNES A, `?v2variant=pm`) correcte
- BUG : Navigation depuis `/onboarding/add-account` vers `/workspace` (sans variant) charge la vue PP avec les données de corentin — fuite de données PP dans contexte PM vide

---

## TEST 4 — Ajouter un compte

**Résultat : RÉUSSI**

- Bouton "Ajouter un compte" → `/onboarding/add-account` → choix PP / PM
- CompanySearchField : recherche "Migros" → 10 résultats avec UID fédéraux (CHE-...), forme juridique, canton automatiquement renseignés
- Sélection "Migros Supermarkt AG" → autofill parfait : raison sociale, SA, ZH
- Bouton "Créer le compte" activé

Création non finalisée (compte fictif de test).

---

## TEST 5 — Isolation RLS (CRITIQUE)

### API switch-tenant non autorisé
```
POST /api/auth/switch-tenant { tenantId: "00000000-0000-0000-0000-000000000001" }
→ 403 "no membership for this tenant"
```
**PASS** — Le backend rejette correctement les tenantIds non-membres.

### Isolation des données entre tenants
- Demo V2 SA : 60 entries ledger
- Swigs Sa : 44 entries ledger
- Intersection des descriptions : **0 cross-leak**
- Chaque token ne sert que les données du tenant encodé dans le JWT

**Résultat RLS backend : SOLIDE**

### Bug de fuite UI (non-RLS)
- Switch dropdown sans reload → badge mis à jour mais React Query continue à servir le cache du tenant précédent
- Navigation `/workspace` sans `?v2variant=pm` après switch PP→PM → composant PP chargé avec données du cache corentin, affiché sous le badge "Marine Duay"
- **Sévérité** : Moyenne-haute. Les données proviennent du cache local, pas d'une vraie fuite RLS. Mais l'utilisateur voit des données d'un autre client dans son espace. Pour une fiduciaire : inacceptable visuellement.

---

## TEST 6 — CmdK et Briefing IA

**Résultat : PARTIEL**

- Ouverture CmdK : instantanée (~0ms)
- Suggestions contextuelles Demo V2 SA : correctes (TVA échéance, rapprochement, anomalies)
- Navigation rapide comptes (1020, 1100, 1510, 2200) avec soldes corrects
- Temps de réponse IA : 2,2s — acceptable

**Bug** : Question "Combien de transactions ai-je ?" → réponse IA incorrecte ("le contexte juridique ne contient aucune information"). L'agent consulte la base de connaissances légales (AFC, CO) au lieu d'appeler le ledger API. L'IA ne dispose pas d'un outil "requête live grand livre". Pour une question factuelle sur les données du tenant, c'est un manque fonctionnel.

---

## TEST 7 — Settings par tenant

**Non testé** — Les pages Settings n'ont pas été atteintes à cause des problèmes de navigation.

---

## TEST 8 — Déconnexion / Re-login

**Résultat : RÉUSSI**

- Bouton "Déconnexion" → `/login` immédiat, localStorage vidé
- Re-login avec qa-test@lexa.test / LexaQA2026! → workspace corentin chargé
- Dropdown après re-login : **4 tenants présents** (corentin, Swigs Sa, Demo V2 SA, Marine Duay)
- Persistance des memberships confirmée

---

## TEST 9 — Sécurité

**Résultat : PASS sur l'API, FAIL partiel sur l'UI**

| Test | Résultat |
|------|----------|
| switch-tenant tenantId étranger | 403 PASS |
| Token expiré → accès refusé | Non testé |
| Cross-tenant ledger (RLS PG) | PASS — 0 leak |
| UI badge-token désync | BUG — badge peut afficher tenant A avec données tenant B |

---

## TEST 10 — Performance

- Chargement workspace Demo V2 SA (30 tx) : < 2s estimé (pas mesuré précisément)
- CmdK ouverture : instantanée
- Switch tenant via UI (sans reload) : rapide mais **données incorrectes**
- Switch tenant via reload : ~1,5s (acceptable)

---

## BUGS CRITIQUES

### BUG-01 : Switch tenant UI sans reload → stale cache PP [CRITIQUE nLPD]
**Reproduction** : Sur `/workspace`, switch via dropdown vers un autre tenant PP → les données affichées restent celles du tenant précédent pendant ~5s, et peuvent persister indéfiniment sans navigation.
**Impact** : Un client fiduciaire peut voir les données d'un autre client affiché sous son propre badge. Bien que la fuite soit du cache React Query (pas RLS), c'est une violation visuelle des données en contexte fiduciaire.
**Fix** : Invalider toutes les queries React Query lors du switch tenant (`queryClient.invalidateQueries()` ou `queryClient.clear()`).

### BUG-02 : Navigation `/workspace` sans `?v2variant=` après switch PP→PM [MAJEUR]
**Reproduction** : Depuis `/onboarding/add-account`, clic "Retour au workspace" → `/workspace` → le routing charge la vue PP avec données de corentin même si le tenant actif est Marine Duay (PM vide).
**Impact** : Affichage de données PP (salaire, vie privée, épargne) d'un autre tenant.
**Fix** : La redirection "Retour au workspace" doit inclure le variant correct basé sur la forme juridique du tenant actif.

### BUG-03 : Login redirect vers /register sur Enter [MOYEN]
**Reproduction** : Saisie email + password + touche Enter → redirect vers `/register` au lieu de soumettre le login.
**Impact** : Friction à l'entrée, risque de création de compte involontaire.
**Fix** : Le keydown handler Enter sur le formulaire login doit déclencher submit, pas navigation.

### BUG-04 : Compte UNKNOWN dans les charges [MINEUR]
**Reproduction** : Workspace Swigs Sa et Demo V2 SA affichent un compte `UNKNOWN` dans les charges.
**Impact** : Comptes non mappés visuellement, audit trail incomplet.
**Fix** : Vérifier les écritures avec account_id non résolu en base, forcer la correspondance plan comptable.

### BUG-05 : CmdK ne consulte pas les données live du grand livre [MINEUR]
**Reproduction** : "Combien de transactions ai-je ?" → réponse depuis base légale, pas depuis `/api/ledger`.
**Impact** : L'IA ne peut pas répondre à des questions factuelles sur les données comptables courantes.
**Fix** : Ajouter un tool `get_ledger_summary` dans le contexte agent CmdK.

---

## VERDICT UX FIDUCIAIRE

**Utilisable ? Conditionnellement, avec reload obligatoire à chaque switch.**

La valeur principale du mode fiduciaire — switcher rapidement entre clients — ne fonctionne pas de manière fiable sans reload. Le workflow actuel est :
1. Clic dropdown → client sélectionné
2. Reload manuel (`F5`) → données correctes chargées
3. Travailler sur le tenant

C'est 2 gestes au lieu de 1. Acceptable pour un MVP, mais fruste en usage intensif (10+ switches/jour).

**Gain de temps vs multi-onglets** : Marginal en l'état. Le dropdown est plus rapide à trouver que de changer d'onglet, mais le reload obligatoire annule l'avantage.

**Consolidation cross-tenants** : Absente. Pas de vue "portefeuille" fiduciaire. À planifier V1.2.

**Recommandation prioritaire** : Corriger BUG-01 (invalidation React Query au switch) et BUG-02 (variant routing) avant tout rollout fiduciaire. Ces 2 fixes sont 1-2h de travail et transforment l'UX.

---

## Artifacts

- `01-login-page.png` — Page login
- `04-dropdown-4-tenants.png` — Dropdown 4 tenants ouvert
- `05-switch-corentin-pp.png` — Vue PP corentin
- `06-demo-v2-sa-workspace.png` — Demo V2 SA initial
- `07-demo-v2-sa-badge-bug.png` — Bug badge "corentin" avec données Demo V2 SA
- `08-switch-marine-duay.png` — Switch Marine Duay
- `09-marine-duay-empty-workspace.png` — Workspace vide Marine Duay
- `10-marine-duay-data-leak-CRITICAL.png` — BUG fuite données PP dans contexte Marine Duay
- `11-add-account-page.png` — Page ajout compte
- `12-company-search-migros.png` — CompanySearch Migros 10 résultats
- `13-relogin-4-tenants-ok.png` — Re-login 4 tenants persistés
