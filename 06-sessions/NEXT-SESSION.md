# NEXT SESSION — Point de reprise

**Dernière session** : [Session 28 — 2026-04-16](2026-04-16-session-28.md) (wizards PM GE/VD/FR, buildPmDeclaration factory, PmWizardCanton, 29/29)
**Prochaine session** : Session 29 — Agent Clôture (clôture continue CO 959a-c, projections bilan + compte résultat depuis event store)

> Session 28 a livré les 3 wizards PM manquants (GE/VD/FR) en généralisant PmWizardVs → PmWizardCanton. Factory buildPmDeclaration(canton) + makeSubmitRoute(canton). qa-lexa **29/29** (26 S27 + 3 fixtures pm-ge/vd/fr). Score MVP estimé ~94%.

---

## Ce qui marche après session 28

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
| **Routes PM draft (Session 27-28)** | |
| `POST /companies/draft` | OK session 27 |
| `GET /companies/draft/:year?canton=*` | OK session 27 |
| `PATCH /companies/draft/:year` | OK session 27 (auto-save dot-path) |
| `POST /companies/draft/:year/submit-vs` | OK session 27 |
| `POST /companies/draft/:year/submit-ge` | **OK session 28** |
| `POST /companies/draft/:year/submit-vd` | **OK session 28** |
| `POST /companies/draft/:year/submit-fr` | **OK session 28** |
| **Migration** | |
| `007_company_drafts.sql` | OK session 27 (table prod) |
| **PDF renderer PM** | |
| `PmPdfRenderer.ts` | OK session 27 (pdfBase64 length ~6000) |
| **Frontend wizard PM** | |
| `/pm/vs/:year` — 6 steps + download PDF | OK session 27 |
| `/pm/ge/:year` — PmWizardCanton | **OK session 28** |
| `/pm/vd/:year` — PmWizardCanton | **OK session 28** |
| `/pm/fr/:year` — PmWizardCanton | **OK session 28** |
| Bouton "Déclaration PM" Workspace canton-aware | **OK session 28** |
| **Modules PM** | |
| `pmTaxEstimator.ts` (IFD 8.5%, ICC V1, capital affinés/canton) | OK session 28 |
| `buildPmDeclaration(canton, params)` factory | **OK session 28** |
| **Spark modèles (12)** | 11 précédents + lexa-fiscal-pm | OK session 26 |
| **Tests auto** | |
| qa-lexa **29/29** — +3 pm-ge/vd/fr-draft-submit | **OK session 28** |

---

## Session 29 — Agent Clôture

### Objectif
Implémenter l'agent de clôture continue (CO 959a-c) : projections bilan + compte résultat automatiques depuis l'event store. Passe vers la partie "comptabilité intelligente" du MVP.

### Livrables cibles
1. **Event store comptable** : catégorisation automatique des transactions (CA, charges, provisions)
2. **Bilan automatique** : actif/passif selon CO 959a depuis les events
3. **Compte résultat** : résultat net automatique depuis les events
4. **Agent clôture** : `POST /agents/cloture/ask` — réponses LIFD art. 58-68 + CO 959a-c
5. **Frontend** : page `/cloture/:year` avec bilan temps réel

### Exclus session 29
- Pas de mapping OCR → PM fields (V2)
- Pas de barèmes ICC PM officiels (TODO session 30+)

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

**Dernière mise à jour** : 2026-04-16 (session 28 — wizards PM GE/VD/FR, PmWizardCanton générique, 29/29)
