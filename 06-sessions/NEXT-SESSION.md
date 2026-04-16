# NEXT SESSION — Point de reprise

**Dernière session** : [Session 29 — 2026-04-16](2026-04-16-session-29.md) (agent clôture, ContinuousClosingService, 3 endpoints ledger, page /close/:year, 31/31)
**Prochaine session** : Session 30 — **À choix Mère** : Agent Conseiller (simulateur "et si ?") OU Agent Audit (vérif citations, hallucinations)

> Session 29 a livré le 12e agent (lexa-cloture), le ContinuousClosingService (bilan + PnL + health depuis event store), 3 endpoints /ledger/*, la page /close/:year avec chat overlay, et fait passer qa-lexa à **31/31**. Score MVP estimé ~96%.

---

## Ce qui marche après session 29

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | OK |
| Auth JWT + rate limit + trust proxy 1 | OK |
| HMAC Pro Lexa + classify auto | OK |
| **MongoDB GridFS** | |
| `lexa-documents` DB sur `127.0.0.1:27017` | OK session 23 |
| **Pipeline OCR** | |
| pdf-parse + fallback PDF→PNG + parseOcrModelOutput | OK session 25 |
| **Routes documents** | |
| `POST /documents/upload` | OK session 23 |
| `POST /documents/:id/apply-to-draft` | OK session 24 |
| **Routes taxpayers PP** | |
| Wizard PP VS/GE/VD/FR | OK sessions 15-22 |
| **Agents actifs (12)** | classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/ne/ju/bj, fiscal-pm, **cloture** |
| **Routes PM** | |
| `POST /agents/fiscal-pm/ask` | OK session 26 |
| `POST /forms/pm-declaration-vs` | OK session 26 |
| `POST /companies/draft/:year/submit-{vs,ge,vd,fr}` | OK sessions 27-28 |
| **Frontend PM** | |
| `/pm/vs/:year` + `/pm/ge/:year` + `/pm/vd/:year` + `/pm/fr/:year` | OK sessions 27-28 |
| **Clôture continue (Session 29)** | |
| `POST /agents/cloture/ask` | **OK session 29** |
| `GET /ledger/balance-sheet/:year` | **OK session 29** |
| `GET /ledger/income-statement/:year` | **OK session 29** |
| `GET /ledger/health/:year` | **OK session 29** |
| `/close/:year` — page 3 tabs + chat Clôture | **OK session 29** |
| Bouton "Clôture" dans Workspace | **OK session 29** |
| **Spark modèles (13)** | 12 précédents + **lexa-cloture** | OK session 29 |
| **Tests auto** | |
| qa-lexa **31/31** — +2 cloture + balance-sheet | **OK session 29** |

---

## Session 30 — Options (à choix Mère)

### Option A : Agent Conseiller
Simulateur "et si ?" — optimisations LPP/3a/amortissements
- `lexa-conseiller` Modelfile (from lexa-fiscal-pm)
- `ConseillerAgent.ts` : tier 0 = LPP + LIFD art.33 (3a) + CO 960a (amortissements)
- `POST /agents/conseiller/ask` avec contexte financier (revenu, capital, situation)
- Page `/conseiller` : formulaire paramètres + réponse comparative
- 2 fixtures qa-lexa → 33/33

### Option B : Agent Audit
Vérification citations, détection hallucinations, audit trail UI
- `lexa-audit` Modelfile
- `AuditAgent.ts` : vérifie cohérence entre réponse agent et sources Qdrant
- `POST /agents/audit/check` : entrée = answer + citations[], sortie = score fiabilité + flags
- Page `/audit` : tableau de bord intégrité citations
- 2 fixtures qa-lexa → 33/33

---

## Dettes identifiées (accumulées)

1. **Käfer accountName complet** : 80 comptes hardcodés → jointure Qdrant (500 comptes)
2. **Détection écritures manquantes avancée** : provisions, accruals, cohérence inter-exercices
3. **Génération annexe CO 959c** (PDF structuré) — session 30+
4. **Refresh ledger_entries** : MV doit être rafraîchie manuellement — auto-refresh sur import transaction
5. **DEV_BYPASS_AUTH** : plusieurs apps — à retirer avant launch
6. **barèmes ICC PM** : VS 8.5%, GE 14%, VD 13.5%, FR 10% — approximatifs, source officielle S30+
7. **Bundle frontend** : 821 KB (249 KB gzip) — code splitting à implémenter avant launch

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11-29)

1-39. (voir archives sessions précédentes)

40. **`fiscal-pm` re-ranking** : tier 4 = LIFD art.57-79 + CO art.957-963, tier 3 = LHID art.24-31
41. **`cloture` re-ranking** : tier 4 = CO art.957-963b uniquement (+ LIFD art.58 tier 3)
42. **ledger_entries MV** : basée sur `TransactionClassified` (pas `EntryPosted`). Colonnes : tenant_id, account, line_type, amount, transaction_date.
43. **Balance sheet split** : classe 1 = actifs, classe 2 comptes 20-27 = passifs, 28-29 = fonds propres.
44. **isBalanced tolérance** : 0.05 CHF (CO art. 959a — arrondi admis).
45. **Tenant vide** : retourner structure à 0 avec isBalanced=true, jamais d'erreur 500.

---

## Avertissements (héritage sessions 11-29)

1. `.env` prod jamais rsync
2. `trust proxy 1` ne pas retirer
3. qa-lexa **31/31 baseline** — si un test fail, investiguer avant push
4. HMAC Pro→Lexa : ne jamais JSON.stringify deux fois
5. JWT override req.tenantId — header X-Tenant-Id ignoré sur routes protégées
6. Disclaimer PDF/XML obligatoire
7. qwen3-vl-ocr sur Spark : output JSON non-déterministe, utiliser parseOcrModelOutput()
8. LEXA_ENABLED=true côté Pro : ne jamais passer à false
9. Backend = tsx watch src/ (pas dist compilé)
10. Templates YAML dans src/execution/templates/
11. MONGO_URL = mongodb://127.0.0.1:27017
12. Rate limit login strict — utiliser http://localhost:3010 depuis serveur pour tests
13. Ollama images[] = PNG/JPEG uniquement — ne jamais envoyer PDF brut en base64
14. test-cert-salaire-1.png = fixture correcte pour tests vision OCR
15. pdfToPng via pdfjs-dist : utilise legacy/build/pdf.mjs + disableWorker: true
16. @napi-rs/canvas : bindings natifs Linux 22.04 sur .59
17. deepseek-ocr : inutilisable (retourne empty) — garder qwen3-vl-ocr
18. qa-lexa doit tourner sur http://127.0.0.1:3010 depuis .59
19. flattenJsonToText : gère JSON imbriqués multi-niveaux — ne pas supprimer
20. **Ollama create API** : utiliser `from` + `system` + `parameters` dans body JSON (pas Modelfile string)
21. **company_drafts** : table séparée de taxpayer_drafts
22. **PmWizardCanton** : générique GE/VD/FR, PmWizardVs reste spécifique VS
23. **qa-lexa rate-limit** : toujours lancer depuis http://localhost:3010 sur .59

**Dernière mise à jour** : 2026-04-16 (session 29 — agent clôture, ContinuousClosingService, 31/31)
