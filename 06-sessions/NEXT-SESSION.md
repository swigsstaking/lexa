# NEXT SESSION — Point de reprise

**Dernière session** : [Session 27 — 2026-04-16](2026-04-16-session-27.md) (wizard PM VS, PmPdfRenderer, migration 007, 26/26)
**Prochaine session** : Session 28 — Clone wizard PM GE/VD/FR + barèmes ICC officiels

> Session 27 a livré le wizard PM VS end-to-end (6 steps frontend + PmPdfRenderer + 4 routes backend + migration 007 company_drafts). qa-lexa **26/26** (25 baseline S26 + 1 fixture pm-vs-1-draft-submit). Score MVP estimé ~93%.

---

## Ce qui marche après session 27

| Composant | Etat |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | OK |
| Auth JWT + rate limit + trust proxy 1 | OK |
| HMAC Pro Lexa + classify auto | OK |
| **MongoDB GridFS** | |
| `lexa-documents` DB sur `127.0.0.1:27017` | OK session 23 |
| **Pipeline OCR** | |
| pdf-parse + fallback PDF→PNG via pdfjs-dist + @napi-rs/canvas | OK session 25 |
| parseOcrModelOutput — flatten récursif JSON imbriqué | OK session 25 |
| **Routes documents** | |
| `POST /documents/upload` | OK session 23 |
| `POST /documents/:id/apply-to-draft` | OK session 24 |
| **Routes taxpayers** | |
| Wizard PP VS/GE/VD/FR | OK sessions 15-22 |
| **Agents actifs (11)** | classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/ne/ju/bj, **fiscal-pm** |
| **Routes PM** | |
| `POST /agents/fiscal-pm/ask` | **OK session 26** |
| `POST /forms/pm-declaration-vs` | OK session 26 (calcul structurel) |
| **Routes PM draft (Session 27)** | |
| `POST /companies/draft` | **OK session 27** |
| `GET /companies/draft/:year?canton=VS` | **OK session 27** |
| `PATCH /companies/draft/:year` | **OK session 27** (auto-save dot-path) |
| `POST /companies/draft/:year/submit-vs` | **OK session 27** |
| **Migration** | |
| `007_company_drafts.sql` | **OK session 27** (table prod) |
| **PDF renderer PM** | |
| `PmPdfRenderer.ts` | **OK session 27** (pdfBase64 length 5800) |
| **Frontend wizard PM** | |
| `/pm/vs/:year` — 6 steps + download PDF | **OK session 27** |
| Bouton "Déclaration PM" Workspace | **OK session 27** |
| **Modules PM** | |
| `pmTaxEstimator.ts` (IFD 8.5%, ICC V1, capital V1) | OK session 26 |
| `PmFormBuilder.ts` VS | OK session 26 |
| **Spark modèles (12)** | 11 précédents + lexa-fiscal-pm | OK session 26 |
| **Tests auto** | |
| qa-lexa **26/26** — +1 pm-vs-1-draft-submit | **OK session 27** |

---

## Session 28 — Clone PM wizard GE/VD/FR + barèmes ICC officiels

### Objectif
Étendre le wizard PM aux cantons GE, VD, FR (clones triviaux de PmWizardVs)
et remplacer les barèmes ICC V1 approximatifs par les taux officiels.

### Livrables

1. **`PmWizardGe.tsx`, `PmWizardVd.tsx`, `PmWizardFr.tsx`** — clones PmWizardVs avec canton hardcodé
2. **Routes `/pm/ge/:year`, `/pm/vd/:year`, `/pm/fr/:year`** dans App.tsx
3. **`GePmFormBuilder.ts`, `VdPmFormBuilder.ts`, `FrPmFormBuilder.ts`** — clones PmFormBuilder avec canton
4. **`GePmPdfRenderer.ts`, `VdPmPdfRenderer.ts`, `FrPmPdfRenderer.ts`** — clones PmPdfRenderer
5. **Barèmes ICC officiels** : remplacer taux V1 (VS 8.5%, GE 14%, VD 13.5%, FR 10%) par taux officiels ingérés
6. **+3 fixtures qa-lexa** → cible **29/29**

### Exclus session 28
- Pas de refactor wizard générique PP/PM (V2)
- Pas de multi-société par tenant (session 33)

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→26)

1-36. (voir archives sessions précédentes)
37. **`fiscal-pm` re-ranking** : tier 4 = LIFD art.57-79 + CO art.957-963, tier 3 = LHID art.24-31
38. **barèmes ICC PM V1** : VS 8.5%, GE 14%, VD 13.5%, FR 10% — approximatifs, TODO session 28+
39. **V1 pm-declaration-vs sans PDF** — retourne JSON structurel. PDF = session 27 avec wizard.
40. **think: false obligatoire** sur tous les modèles qwen3 (sinon field `response` vide)

---

## Avertissements (héritage sessions 11-26)

1. `.env` prod jamais rsync
2. `trust proxy 1` ne pas retirer
3. qa-lexa **25/25 baseline** — si un test fail, investiguer avant push
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
20. **Ollama create API** : utiliser champ `from` + `system` + `parameters` dans le body JSON (pas Modelfile string) pour éviter l'erreur "neither 'from' or 'files' was specified"

21. **company_drafts** : table séparée de taxpayer_drafts — schéma bilan/résultat PM ≠ schéma revenus/déductions PP
22. **PmWizardVs hardcodé VS** : canton GE/VD/FR = sessions 28+. Ne pas généraliser prématurément.
23. **qa-lexa rate-limit** : toujours lancer depuis http://localhost:3010 sur .59, jamais depuis Mac local

**Dernière mise à jour** : 2026-04-16 (session 27 — wizard PM VS, PmPdfRenderer, migration 007, 26/26)
