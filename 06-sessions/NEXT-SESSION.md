# NEXT SESSION — Point de reprise

**Dernière session** : [Session 26 — 2026-04-16](2026-04-16-session-26.md) (agent Fiscal-PM, FormBuilder PM VS, pmTaxEstimator, 25/25)
**Prochaine session** : Session 27 — Wizard PM frontend VS + PDF renderer PM + FormBuilder GE/VD/FR

> Session 26 a livré l'agent fiscal-pm (12e modèle Lexa, 11e agent actif), le moteur de calcul pmTaxEstimator (IFD 8.5% + ICC cantonal V1 + capital), et la route POST /forms/pm-declaration-vs. qa-lexa **25/25** (23 baseline + 1 fiscal-pm + 1 form PM).

---

## Ce qui marche après session 26

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
| `POST /forms/pm-declaration-vs` | **OK session 26** (calcul structurel, pas PDF) |
| **Modules PM** | |
| `pmTaxEstimator.ts` (IFD 8.5%, ICC V1, capital V1) | **OK session 26** |
| `PmFormBuilder.ts` VS | **OK session 26** |
| **Spark modèles (12)** | 11 précédents + lexa-fiscal-pm | **OK session 26** |
| **Tests auto** | |
| qa-lexa **25/25** — +1 fiscal-pm +1 form pm-vs | **OK session 26** |

---

## Session 27 — Wizard PM frontend VS

### Objectif
Livrer le wizard PM frontend VS (6 steps) + PDF renderer PM.

### Livrables

1. **Page `/pm-declaration/:year`** — wizard 6 steps PM (clone pattern PP wizard)
   - Step 1 : Identité société (raison sociale, IDE, canton, commune, legalForm)
   - Step 2 : Exercice + bénéfice comptable (CA, résultat brut)
   - Step 3 : Corrections fiscales (charges non admises, amortissements, provisions)
   - Step 4 : Fonds propres (capital social + réserves + bénéfice reporté)
   - Step 5 : Estimation fiscale (IFD + ICC VS + capital) — appel `pmTaxEstimator`
   - Step 6 : Aperçu + bouton "Générer PDF"

2. **`VsPmPdfRenderer.ts`** — PDF déclaration PM (clone `VsPpPdfRenderer.ts`)

3. **FormBuilder PM GE/VD/FR** — `GePmFormBuilder.ts`, `VdPmFormBuilder.ts`, `FrPmFormBuilder.ts` (clones triviaux VS)

4. **Route `POST /forms/pm-declaration-vs`** — mettre à jour pour retourner PDF en base64

5. **+1 fixture qa-lexa wizard PM** → cible **26/26**

### Exclus session 27
- Pas de barèmes ICC officiels (session 28+)
- Pas d'agent Clôture (session 28)
- Pas d'annexes CO bilans fiscaux (session 28+)

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

**Dernière mise à jour** : 2026-04-16 (session 26 — agent fiscal-pm, FormBuilder PM VS, 25/25)
