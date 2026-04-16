# Audit E2E Lexa — 2026-04-16 (Lane C S37)

## Environnement
- URL : https://lexa.swigs.online
- Chrome DevTools MCP : headless via agent Sonnet 4.6
- Date : 2026-04-16
- Branche : main (post-merge Lane B menu sous-menus)
- Comptes testés : `demo@lexa.test / LexaDemo2026!` et `fiduciaire@lexa.test / LexaFidu2026!`
- Contexte : Lane A (S37 Queue LLM) en déploiement parallèle — impact noté sur les appels LLM

---

## Parcours 1 — Fiduciaire multi-clients
**Statut** : ⚠️ Fonctionnel avec 2 bugs identifiés

### Steps exécutés

- **Login fiduciaire** : OK — `POST /api/auth/login` retourne token avec 2 memberships (`...0099` Demo Sàrl, `...0101` Acme SA)
- **Switcher clients** : Trouvé dans menu `Paramètres` (nouveau menu Lane B) — pas dans un composant dédié fiduciaire. Fonctionnel mais UX questionnable (on ne s'attend pas à trouver le switch client dans "Paramètres").
- **Liste clients** : `GET /api/fiduciary/clients` retourne bien `[{Demo Sàrl, role:fiduciary}, {Acme SA, role:fiduciary}]` ✅
- **Switch Demo Sàrl → /pm/vs/2026** : 
  - legalName : "Demo Sàrl" ✅
  - IDE : CHE-100.200.300 ✅
  - Siège : Sion (VS) ✅
  - Bénéfice comptable : 180 000 CHF ✅
  - Estimation impôt : 31 600 CHF (ICC 15 725 + IFD 15 725) ✅
- **Switch Acme SA → /pm/ge/2026** :
  - legalName : "Acme SA" ✅
  - Forme : SA ✅
  - IDE : CHE-200.300.400 ✅ (différent de Demo Sàrl)
  - Siège : Genève ✅
  - Bénéfice comptable : 500 000 CHF ✅ (différent)
  - Estimation impôt : 85 375 CHF ✅ (différent)
- **Isolation inverse (login demo@lexa.test)** : ⚠️ BUG — voir ci-dessous

### Bugs identifiés

**BUG-P1-01 [HIGH] — Fuite isolation session après switch de compte**
- Après logout fiduciaire + login `demo@lexa.test`, le menu Paramètres affiche toujours les 2 clients (Demo Sàrl ET Acme SA).
- Cause : `GET /api/fiduciary/clients` utilise la réponse HTTP 304 (cache navigateur) avec l'ancien token fiduciaire, pas le nouveau token demo.
- Impact : Un utilisateur demo connecté après un fiduciaire sur le même navigateur voit les clients du fiduciaire dans son menu.
- Preuve réseau : reqid=243 utilise le Bearer token du compte fiduciaire (pas du compte demo qui vient de se connecter).
- Fix attendu : invalider le cache `/api/fiduciary/clients` à chaque changement de token auth.

**BUG-P1-02 [MEDIUM] — Label "PM VS" affiché sur wizard PM GE**
- Sur `/pm/ge/2026`, le side panel affiche "APERÇU EN DIRECT — PM VS" au lieu de "PM GE".
- La description du step 1 dit "pour le canton du Valais" au lieu de "du canton de Genève".
- Impact : confusion utilisateur sur le canton actif.

**BUG-P1-03 [MEDIUM] — Pas d'indicateur visuel du client actif dans le header**
- Après switch vers Demo Sàrl ou Acme SA, aucun badge/breadcrumb ne montre quel tenant est actif.
- L'utilisateur fiduciaire n'a aucun feedback visuel permanent sur le contexte actif.

### Console errors : aucune
### Network errors : aucun (304 = cache — pas des erreurs)

### Screenshots
- `parcours-1-step-1-login-fiduciaire.png` — workspace post-login
- `parcours-1-step-3-menu-switcher-fiduciaire.png` — menu Paramètres avec 2 clients
- `parcours-1-step-4-pm-vs-2026-demo-sarl.png` — wizard PM VS Demo Sàrl
- `parcours-1-step-5-workspace-acme-sa-vide.png` — workspace Acme SA (grand livre vide)
- `parcours-1-step-6-pm-ge-2026-acme-sa.png` — wizard PM GE Acme SA

---

## Parcours 2 — Salarié upload certif + auto-fill wizard

**Statut** : ⚠️ Auto-fill ✅ / Upload OCR ❌ (502 Backend down)

### Steps exécutés

- **Login demo@lexa.test** : OK ✅
- **Navigate /documents** : OK — 3 documents seed affichés ✅
  - `facture_bureau_sa_2026.pdf` — 27.7 KB, 9 champs extraits, confiance 87%, qwen3-vl-ocr
  - `attestation_3a_2025.pdf` — 12.5 KB, 6 champs extraits, confiance 93%, bouton "Pré-remplir wizard"
  - `cert_salaire_2025.pdf` — 44.1 KB, 7 champs extraits, confiance 90%, bouton "Pré-remplir wizard"
- **Champs extraits cert salaire** : employer, employeeName, grossSalary=85000, netSalary=72500, deductionsAvsLpp=8500, year=2025, period ✅
- **Upload test-cert-salaire.pdf** : ❌ → `POST /api/documents/upload` → 502 Bad Gateway nginx
  - Cause probable : service OCR Qwen3-VL down / Lane A S37 restart backend
  - Message UI : "Request failed with status code 502" (technique, pas user-friendly)
- **Pré-remplir wizard depuis doc seed** : "1 champ(s) pré-rempli(s) dans votre déclaration 2026" ✅
- **Bouton "Ouvrir le wizard →"** : ⚠️ — navigue vers `/workspace` au lieu du wizard PP
- **Wizard PP /taxpayer/2026** (navigation directe via menu) :
  - Salaire brut : **85 000 CHF** pré-rempli ✅
  - Badge **"📎 extrait de cert_salaire_2025.pdf"** visible ✅ (feature "magique" opérationnelle)
  - Revenu imposable : 82 450 CHF ✅
  - Estimation live : 6 171 CHF (ICC 4 481 + IFD 1 690) ✅
- **Génération PDF** : "Déclaration VS générée ✓" avec event audit `51cfdf53` ✅
  - PDF base64 retourné dans la réponse API ✅
  - Disclaimer légal LIFD art. 33, LICD VS, délai 31 mars ✅
  - Bouton de téléchargement PDF absent dans l'UI ⚠️

### Bugs identifiés

**BUG-P2-01 [CRITICAL] — Upload OCR retourne 502 Bad Gateway**
- `POST /api/documents/upload` → HTTP 502 depuis nginx
- Le service OCR backend ne répond pas sur les nouveaux uploads
- Note : peut être transitoire (Lane A S37 deployment), mais bloquant pour la feature beta
- Message d'erreur UI trop technique pour un beta user

**BUG-P2-02 [HIGH] — Bouton "Ouvrir le wizard →" redirige vers /workspace**
- Après pré-remplissage, le CTA "Ouvrir le wizard →" devrait naviguer vers `/taxpayer/2026` (PP) ou `/pm/vs/2026` (PM)
- Au lieu de ça, il navigue vers `/workspace` (grand livre)
- L'utilisateur doit utiliser le menu pour trouver le wizard — parcours cassé

**BUG-P2-03 [HIGH] — PDF généré mais pas proposé au téléchargement**
- La génération PDF (submit) retourne le PDF en base64 dans la réponse API
- L'UI affiche "Déclaration VS générée ✓" mais sans lien/bouton "Télécharger PDF"
- L'utilisateur ne peut pas récupérer son document

**BUG-P2-04 [MEDIUM] — Incohérence ICC entre estimateur live et PDF final**
- Estimateur live : ICC = 4 481 CHF
- Réponse API submit : ICC = 9 725,97 CHF (barèmes officiels ingérés)
- Discordance de ~117% sur l'ICC entre ce que l'utilisateur voit et le PDF généré
- Cause : deux algorithmes différents (estimateur simplifié vs barèmes officiels)

**BUG-P2-05 [MEDIUM] — Seul 1 champ sur 7 pré-rempli depuis le cert salaire**
- Le doc cert_salaire seed a 7 champs extraits (grossSalary, netSalary, deductionsAvsLpp, employer, employeeName, year, period)
- Seulement `grossSalary` est mappé vers le wizard PP (1/7)
- Les autres champs pertinents (name, deductionsAvsLpp) ne sont pas auto-remplis

**BUG-P2-06 [LOW] — /pp/vs/2026 redirige vers /workspace (route inconnue)**
- La route `/pp/vs/2026` n'existe pas — l'URL correcte est `/taxpayer/2026`
- Peut causer des confusions avec la route `/pm/vs/2026` qui, elle, fonctionne

### Console errors
- `[error] Failed to load resource: the server responded with a status of 502 ()` — lors de l'upload OCR

### Screenshots
- `parcours-2-step-1-documents-liste-3docs.png`
- `parcours-2-step-2-ocr-upload-502-error.png`
- `parcours-2-step-3-prefill-1-champ.png`
- `parcours-2-step-4-wizard-pp-prefill-85000.png`
- `parcours-2-step-5-wizard-pp-salaire-85000-badge-extrait.png`
- `parcours-2-step-6-pdf-genere-no-download.png`

---

## Parcours 3 — SME PM Sàrl clôture continue

**Statut** : ⚠️ Clôture/Conseiller ✅ / Agent LLM timeout (Lane A S37)

### Steps exécutés

- **Wizard PM VS /pm/vs/2026** :
  - Données seed Demo Sàrl pré-remplies ✅
  - Modification bénéfice 180k → 250k : side panel live se met à jour instantanément ✅ (estimation 43 500 CHF)
  - Autosave : "Brouillon · enregistré auto" permanent ✅
- **Page Clôture /close/2026** :
  - Bilan actifs 228 975 CHF, passifs 35 200 CHF, statut "Déséquilibré" ✅
  - 3 onglets : Bilan, Compte de résultat, Santé comptable ✅
  - Santé comptable : 35 écritures, dernière 2026-12-15, 2 points d'attention avec références CO ✅
  - Points d'attention : bilan déséquilibré 193 775 CHF, absence amortissements (CO art. 960a al. 3) ✅
- **Agent Clôture** :
  - Panneau s'ouvre correctement ✅
  - Question soumise : "Quel est mon bénéfice net imposable ?" ✅
  - `POST /api/agents/cloture/ask` → pending ~7 min → timeout sans réponse
  - Cause : Lane A S37 Queue LLM en déploiement — appel LLM dans la queue (comportement attendu selon brief)
  - UX : le spinner "Lexa Clôture réfléchit…" s'affiche indéfiniment — pas de timeout UI ni message d'erreur
- **Page Audit /audit/2026** :
  - 72 événements, 5 décisions IA, confiance moy. 83.6%, 1 basse confiance ✅
  - Timeline Jan–Sept 2026 complète ✅
  - Vérificateur citations légales (CO 957, LIFD 33) ✅
  - CO art. 958f conservation 10 ans ✅
- **Page Conseiller /conseiller/2026** :
  - 3 simulations : Rachat LPP, Pilier 3a, Dividende vs Salaire ✅
  - Revenu pré-rempli 85 000 CHF ✅
  - Simulation Rachat LPP 10k : économie **2 794,08 CHF**, taux 27.94%, impôt 11 885 → 9 091 CHF ✅
  - Calcul instantané (pas de LLM requis) ✅
  - Disclaimer OPP2 visible ✅

### Bugs identifiés

**BUG-P3-01 [HIGH] — Agent Clôture timeout sans feedback UI**
- `POST /api/agents/cloture/ask` reste pending indéfiniment (7+ min observés)
- Le spinner "Lexa Clôture réfléchit…" s'affiche sans timeout
- Pas de message d'erreur ni de possibilité d'annuler la requête
- Cause probable : Queue LLM S37 surchargée / backend redémarré pendant le test
- Fix : ajouter timeout UI de 60-90s avec message d'erreur et bouton retry

**BUG-P3-02 [MEDIUM] — Compte de résultat onglet non testé (manque de temps)**
- L'onglet "Compte de résultat" de `/close/2026` n'a pas été inspecté — à re-tester en S38

### Console errors : aucune observée sur ces pages
### Screenshots
- `parcours-3-step-1-pm-vs-identite-demo-sarl.png`
- `parcours-3-step-2-close-bilan.png`
- `parcours-3-step-3-close-sante-comptable.png`
- `parcours-3-step-4-agent-cloture-pending.png`
- `parcours-3-step-5-audit-timeline.png`
- `parcours-3-step-6-conseiller-rachat-lpp-10k.png`

---

## Vérifications transverses

### Console / Network

**Erreurs console relevées sur l'ensemble de la session :**
- `[error] Failed to load resource: 502` — upload OCR (une seule occurrence, page /documents)
- Aucune autre erreur ou warning sur les autres pages

**Requêtes réseau lentes (>2s) :**
- `POST /api/agents/cloture/ask` : >420s (pending, jamais résolu)
- `POST /api/documents/upload` : terminé par 502 (~20s de traitement avant erreur)
- Toutes les autres requêtes : <500ms (excellentes performances API)

### Mobile responsive (iPhone 375x812)

**Page Documents (/documents) :**
- Structure lisible, 3 docs affichés ✅
- Boutons "Choisir un fichier", "Pré-remplir wizard" accessibles au touch ✅
- Pas de débordement horizontal visible ✅

**Wizard PP (/taxpayer/2026) en 375px :**
- Navigation wizard : labels réduits à numéros "1-6" (adaptation mobile raisonnable) ✅
- Formulaire lisible ✅
- Side panel estimateur live placé **après** le formulaire principal — hors viewport pendant la saisie ⚠️
- Pas de bottom sheet / sticky panel pour l'estimation — l'utilisateur ne voit pas l'estimation en tapant

**BUG-T01 [MEDIUM] — Side panel estimateur fiscal non visible en mobile**
- En 375px, le panel "APERÇU EN DIRECT" est sous le formulaire, hors viewport
- L'utilisateur mobile ne voit pas l'estimation live pendant la saisie
- Fix : rendre le panel sticky, ou le placer en bottom sheet collapsible en mobile

### Lighthouse

| Page | Accessibility | Best Practices | SEO | Notes |
|------|--------------|----------------|-----|-------|
| Workspace (homepage) | **95** | **100** | **82** | 3 tests failed, mode navigation |
| Wizard PM /pm/vs/2026 | **95** | **100** | **60** | Mode snapshot — SEO bas attendu pour page app authentifiée |

**SEO workspace 82** — 3 failures à investiguer (probablement robots meta, canonical, og:image)

**BUG-T02 [LOW] — SEO score bas sur les pages wizards (60)**
- Pages wizards non indexables (app authentifiée) — 60 est acceptable
- Mais homepage workspace pourrait être 90+ avec ajout de meta tags

### 404 handling

- `/taxpayer/invalid-canton/2026` → redirect silencieux vers `/workspace` ✅ (pas de crash)
- `/pm/xx/2026` → redirect vers `/workspace` ✅
- `/page-inexistante-xyz` → redirect vers `/workspace` ✅

**BUG-T03 [MEDIUM] — Pas de page 404 custom**
- Toutes les routes invalides redirigent vers le workspace sans message d'erreur
- L'utilisateur qui tape une URL erronée ne reçoit aucun feedback
- Fix : ajouter une page 404 avec message "Page introuvable" et lien de retour

---

## Synthèse

### Bugs bloquants pour beta (CRITICAL)

1. **BUG-P2-01** — Upload OCR retourne 502 Bad Gateway : la feature "magique" de Lexa (upload → OCR → auto-fill) est non testable avec de nouveaux documents. Probablement transitoire (Lane A S37) mais doit être validé post-déploiement.

### Bugs gênants (HIGH)

2. **BUG-P1-01** — Fuite isolation session : après switch de compte sur le même navigateur, le menu fiduciaire persiste pour le nouveau compte (cache HTTP 304 non invalidé post-login)
3. **BUG-P2-02** — CTA "Ouvrir le wizard" redirige vers workspace au lieu du wizard PP/PM correspondant
4. **BUG-P2-03** — PDF généré mais non proposé au téléchargement (pas de lien download dans l'UI)
5. **BUG-P2-04** — Discordance ~117% entre estimateur live ICC et ICC du PDF final (deux algorithmes différents)
6. **BUG-P3-01** — Agent Clôture timeout sans feedback UI (spinner infini, pas de retry)

### Polish UX (MEDIUM)

7. **BUG-P1-02** — Label "PM VS" sur wizard PM GE (canton incorrect dans side panel)
8. **BUG-P1-03** — Pas d'indicateur visuel du client actif dans le header pour le fiduciaire
9. **BUG-P2-05** — Seulement 1/7 champs mappés lors du pré-remplissage depuis certif salaire
10. **BUG-T01** — Side panel estimateur fiscal hors viewport en mobile 375px
11. **BUG-T03** — Pas de page 404 custom

### Nice-to-have (LOW)

12. **BUG-P2-06** — Route `/pp/vs/2026` inconnue (confusion avec `/pm/vs/2026`)
13. **BUG-T02** — SEO score 82 sur workspace (meta tags manquants)
14. Message d'erreur OCR trop technique ("Request failed with status code 502") pour un beta user
15. Switcher fiduciaire dans "Paramètres" — UX préférable : composant dédié dans le header

---

## Score global E2E

| Parcours / Axe | Score | Justification |
|---------------|-------|--------------|
| Parcours 1 — Fiduciaire | 7/10 | Fonctionnel avec bug isolation session + label canton |
| Parcours 2 — Upload + auto-fill | 6/10 | Auto-fill ✅ mais 502 OCR + PDF sans download + CTA cassé |
| Parcours 3 — SME PM clôture | 8/10 | Clôture + Audit + Conseiller solides, agent LLM timeout (prob. transitoire) |
| Transverse | 7/10 | Lighthouse excellent, mobile acceptable, 404 sans message |

**Score moyen : 7/10**

---

## Verdict

**Nécessite 2-3 sessions fix** avant beta fiduciaire.

**Bloqueurs absolus** :
- 502 OCR à corriger/confirmer post-Lane A
- PDF sans téléchargement
- CTA "Ouvrir wizard" cassé

**Points forts confirmés** :
- Auto-fill salaire 85 000 CHF avec badge `📎 extrait de cert_salaire_2025.pdf` fonctionne parfaitement
- Live estimator PM (ICC/IFD) temps réel ✅
- Isolation tenant Demo Sàrl / Acme SA confirmée par l'API ✅
- Page Audit CO 958f avec 72 events timeline ✅
- Simulation Rachat LPP instantanée et précise ✅
- Lighthouse : 95 A11y, 100 Best Practices ✅
- 0 console error sur les pages nominales ✅

---

*Rapport généré par agent Sonnet 4.6 — Lane C S37 — 2026-04-16*
*Screenshots : `06-sessions/e2e-screenshots/` (21 fichiers)*
