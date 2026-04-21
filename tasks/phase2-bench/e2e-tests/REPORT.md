# RAPPORT E2E — OCR Pipeline + Champs IA Lexa
Date : 2026-04-21
Environnement : prod `https://lexa.swigs.online`
Tenant : Demo V2 SA `47eddb05-d46b-48cd-ad23-698cc30d1d89` + Marine Duay PP
Auth : `qa-test@lexa.test` (JWT obtenu via `/api/auth/login`)

---

## PHASE A — Pipeline OCR

### Résultat global : BLOQUÉ — BUG P1 CRITIQUE

Le pipeline OCR est **non fonctionnel en production**.

#### Bug P1 : EACCES `/var/lexa`

- **Symptôme** : `POST /api/pp/import/upload` → HTTP 500 `{"error":"upload_failed","message":"EACCES: permission denied, mkdir '/var/lexa'"}`
- **Cause** : Le répertoire `/var/lexa/uploads` n'existe pas (ou droits insuffisants) sur le serveur prod `.59`. La variable `UPLOADS_ROOT` n'est pas définie dans `.env` prod, le code tombe sur le fallback `/var/lexa/uploads` (hardcodé dans `services/storage/uploads.ts`).
- **Impact** : 100% des uploads bloqués. Pipeline `pending → processing → extracted` jamais déclenché.
- **UX** : La modal import ne montre aucune erreur visible — elle reste ouverte silencieusement après la 500.
- **Fix** : `mkdir -p /var/lexa/uploads && chown swigs:lexa /var/lexa/uploads && chmod 750 /var/lexa/uploads` sur `.59`, OU définir `UPLOADS_ROOT=/chemin/accessible` dans `.env` prod.

#### Documents testés

| Doc | Type | HTTP | Latence | Résultat |
|-----|------|------|---------|---------|
| `test-cert-salaire.pdf` (fixture Swissdec) | PDF | 500 | 194ms | FAIL — EACCES |
| Upload via UI modal (catégorie Salaire) | PDF | 500 | ~200ms | FAIL — EACCES |

**Latence OCR** : non mesurable (bloqué avant le worker BullMQ).
**Qualité extraction** : non testable.
**Taux confiance** : non testable.

---

## PHASE B — Tests visuels champs IA

### Services globaux
- `GET /api/health` : **OK** — Postgres, Qdrant (9 761 points), Ollama, Embedder, Mongo tous UP

---

### B1 — LexaInsight (workspace PP Marine Duay)
**PASS** — Screenshot : `screenshots/08-workspace-pp-marine-duay.png`

- Texte affiché : `"Vous pouvez encore verser 3'000 CHF sur votre 3e pilier — économie fiscale estimée : ~790 CHF"`
- Calcul cohérent : pilier 3a = 7 056 / plafond 7 260, delta correct
- Bouton "Simuler ↗" fonctionnel

### B2 — Briefings quotidiens
**PASS** — `GET /api/conseiller/briefings` HTTP 200, latence 26ms

- Briefing du 2026-04-21 généré, contenu pertinent (aucune échéance critique + points de vigilance)

### B3 — CmdK (⌘K) — 3 questions
**PASS** — Screenshot : `screenshots/03-cmdk-open.png`, `screenshots/05-cmdk-answer.png`

| Question | Latence | Citations | Qualité |
|----------|---------|-----------|---------|
| "Quel taux TVA pour prestation de conseil?" | 6.5s | 3 (AFC-INFO_TVA_12_TDFN, Plan-Käfer) | Excellente (6.2% + nuance 8.1%) |
| "Comment réduire mes impôts en Valais?" | 17.6s | 5 | Complète (LF VS, réductions famille) |
| "Quel taux TVA normal en Suisse 2026?" | 4.6s | 5 | Correcte (8.1% OLTVA art. 41) |
| "Comment calculer les rachats LPP?" | 12.3s | 5 | Précise (LIFD art. 33) |

### B4 — Modal PpImportValidationModal
**NON TESTABLE** — dépend du pipeline OCR bloqué par Bug P1. Liste imports = 0.

### B5 — Wizard fiscal PP (VS)
**PASS** — Screenshots : `screenshots/06-wizard-pp-vs-deductions.png`, `screenshots/07-wizard-pp-vs-revenus.png`

Champs pré-remplis par IA :
- Salaire brut : 116 500 CHF
- Pilier 3a : 7 056 CHF (plafond 7 260)
- Rachats LPP : 3 000 CHF
- Primes assurance : 5 280 CHF
- Frais pro : forfait 3% (auto)
- Estimation impôt VS en direct : **15 407 CHF** (ICC 12 705 + IFD 2 701 = 16.0%)

Note : `?canton=ge` dans l'URL est ignoré — le canton est lié au profil tenant (VS), pas au paramètre URL.

### B6 — Wizard fiscal PM (VS)
**PASS** — Screenshots : `screenshots/11-wizard-pm-vs-identite.png`, `screenshots/12-wizard-pm-vs-financiers.png`

Champs pré-remplis depuis comptabilité :
- Raison sociale : "Demo V2 SA"
- Charges de personnel : **47 275 CHF** (extrait du grand livre Käfer, comptes classe 5)
- Placeholders contextuels : CHE-123.456.789, Rue de la Paix 1, NPA 1950

### B7 — Classifier transactions Käfer
**PASS** — `POST /api/rag/classify` HTTP 200

| Transaction | Débit | Crédit | Confiance | Latence |
|-------------|-------|--------|-----------|---------|
| Loyer bureau | 6000 - Loyers | 1020 - Banque | 0.95 | 7.1s |
| Vente prestation conseil | 1020 - Banque | 3200 - Prestations services | 0.92 | 4.5s |

Plan Käfer respecté, code TVA inclus, montant HT calculé (ex: 2312.67 pour 2500 TTC@8.1%).

---

## Bugs trouvés

| Priorité | Bug | Fix |
|---------|-----|-----|
| **P1 — CRITIQUE** | `/var/lexa` permission denied en prod — pipeline OCR bloqué à 100% + modal muette sur 500 | `mkdir -p /var/lexa/uploads && chown swigs:lexa ... && chmod 750 ...` OU `UPLOADS_ROOT=/tmp/lexa` dans `.env` prod |
| P2 — MINEUR | Workspace PM affiche codes de comptes (`3200`) sans libellés (`Prestations services`) | Vérifier le chargement du plan Käfer dans la vue workspace PM |
| P3 — INFO | Paramètre `?canton=ge` ignoré dans l'URL wizard PP | Comportement attendu si canton lié au profil tenant |

---

## Verdict global

| Champ IA | Status |
|----------|--------|
| LexaInsight PP (conseil 3e pilier) | PASS |
| Briefings quotidiens | PASS |
| CmdK RAG (3-5 questions) | PASS |
| Modal OCR upload | **FAIL — Bug P1** |
| Modal PpImportValidationModal | NON TESTABLE |
| Wizard PP VS (champs IA pré-remplis) | PASS |
| Wizard PM VS (charges depuis grand livre) | PASS |
| Classifier transactions Käfer | PASS |

**7/8 champs IA fonctionnels. 1 bloqué (OCR upload) par Bug P1 infra.**

---

## Screenshots

```
screenshots/01-workspace-initial.png          — Workspace PP initial
screenshots/02-workspace-demo-v2-sa.png       — Workspace PM Demo V2 SA (Colonnes B)
screenshots/03-cmdk-open.png                  — CmdK avec suggestions IA
screenshots/04-cmdk-question.png              — CmdK question TVA
screenshots/05-cmdk-answer.png                — CmdK réponse + sources AFC
screenshots/06-wizard-pp-vs-deductions.png    — Wizard PP VS Déductions (pré-rempli)
screenshots/07-wizard-pp-vs-revenus.png       — Wizard PP VS Revenus (116 500 CHF)
screenshots/08-workspace-pp-marine-duay.png   — Workspace PP + LexaInsight conseil
screenshots/09-pp-import-modal.png            — Modal import OCR (6 catégories)
screenshots/10-ocr-upload-500-error.png       — Upload → 500 EACCES (Bug P1)
screenshots/11-wizard-pm-vs-identite.png      — Wizard PM VS Identité
screenshots/12-wizard-pm-vs-financiers.png    — Wizard PM VS Financiers (47 275 CHF)
screenshots/13-workspace-lexa-remarque.png    — Workspace PM LEXA REMARQUE
```
