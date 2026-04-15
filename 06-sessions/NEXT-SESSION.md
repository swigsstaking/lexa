# NEXT SESSION — Point de reprise

**Dernière session** : [Session 22.5 — 2026-04-15](2026-04-15-session-22-5-binding.md)
**Prochaine session** : Session 23 — Pipeline OCR (MongoDB GridFS + upload + deepseek-ocr + Document model)

> Session 22.5 a livre le binding NE/JU/BJ : 3 agents TS (FiscalPpNeAgent, FiscalPpJuAgent, FiscalPpBjAgent), 3 routes POST /agents/fiscal-pp-{ne,ju,bj}/ask, GET /agents = 10 agents actifs, qa-lexa **21/21** passRate 100%. Smoke HTTPS 3 cantons OK (plafond 7260 CHF, citations=5, latence < 20s).

---

## Ce qui marche après session 22.5

| Composant | Etat |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | OK |
| Auth JWT + rate limit + trust proxy 1 | OK |
| HMAC Pro Lexa + classify auto | OK |
| HMAC Lexa Pro (webhook retour) | OK session 20 |
| **Wizard contribuable** | |
| Wizard PP VS 6 steps sur `/taxpayer/:year` | OK session 15 |
| Wizard PP GE 6 steps sur `/taxpayer/ge/:year` | OK session 21 |
| Wizard PP VD 6 steps sur `/taxpayer/vd/:year` | OK session 21 |
| Wizard PP FR 6 steps sur `/taxpayer/fr/:year` | OK session 22 Lane A |
| **Knowledge base** | |
| Canton VS (339 articles) | OK |
| Canton GE (373 articles) | OK |
| Canton VD (381 articles) | OK |
| Canton FR (1035 articles LICD/LIC/ORD-FP) | OK session 21 |
| Canton NE (LCdir-NE, RGI-NE, ORD-FP-NE) | OK session 25 Lane B |
| Canton JU (LI-JU RSJU 641.11) | OK session 25 Lane B |
| Canton BJ (LI-BE/OI-BE RSB 661.11/661.111 FR) | OK session 25 Lane B |
| Qdrant `swiss_law` | **9846 pts** |
| **Agents actifs (10)** | classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/ne/ju/bj |
| **Tests auto** | |
| qa-lexa **21/21** via HTTPS public | OK **session 22.5** |

---

## Priorite session 23 — OCR Pipeline

### 1. MongoDB GridFS + Document model (~1h)

- Installer `mongoose` + `mongodb` dans le backend
- `Document` model : tenantId, filename, mimeType, gridfsId, status (pending/processing/done/error), rawText, extractedData, createdAt
- `POST /documents/upload` : multipart/form-data, store dans GridFS
- `GET /documents/:id` : retourne metadata + rawText si dispo

### 2. deepseek-ocr integration (~1h)

- Ollama model `deepseek-ocr` sur Spark (verifier presence)
- Service `OcrService.ts` : fetch GridFS binary → base64 → Ollama vision → rawText
- Route `POST /documents/:id/ocr` : lance extraction async
- Stocker rawText dans Document

### 3. Linkage Expense/Invoice → Document (~30 min)

- Ajouter `documentIds: string[]` sur modeles existants
- Route `POST /expenses/:id/attach-document`
- qa-lexa fixture : upload + ocr + assert rawText non vide

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→21)

1. Canvas → react-flow définitif
2. Dark mode → livré session 11
3. Multi-tenant isolation par JWT → req.tenantId override
4. Autonomie IA → validation humaine obligatoire
5. Langue v1 → FR uniquement
6. Auth → JWT simple HS256 7d, bcryptjs cost 12
7. Deploy → `lexa.swigs.online` Let's Encrypt
8. Webhook Pro↔Lexa → HMAC SHA256 timing-safe
9. PDF → pdfkit backend
10. Template forms → YAML canonique + copie runtime embed
11. Helpers execution mutualisés → `shared.ts`
12. Idempotence par formKind
13. Un YAML + un Builder par formulaire
14. Un Modelfile par canton
15. qa-lexa baseline de régression → **17/17** après session 21
16. HMAC service-to-service strictement séparé du JWT
17. Un draft par tenant par année fiscale
18. State wizard en JSONB flexible, mutation atomique par dot-path
19. `app.set('trust proxy', 1)` obligatoire
20. Source canonique KB cantonale : HTML statiques officiels (ou API REST si SPA)
21. Re-ranking agent cantonal : tier 0 sources cantonales PP
22. Observation cron = filet optionnel, synthetic suffit
23. **Wizard générique `TaxpayerWizardCanton` avec `CantonConfig`** — session 21
24. **Backend tourne via `tsx watch src/` — rsync doit cibler src/, pas dist/**
25. **PATCH profile auto-save non-bloquant** — erreur catchée silencieusement
26. **BLV VD = API REST AkomaNtoso** (pas HTML statique direct) — session 18
27. **Firefox Playwright sur Spark** disponible pour découvrir des APIs masquées par SPA
28. **Ollama v0.20.x** : `POST /api/create` utilise `from` + `system` + `parameters` (pas `modelfile` texte)
29. **bdlf.fr.ch** : `GET /api/fr/texts_of_law/{sn}/show_as_json` pour lois cantonales FR

---

## Avertissements (héritage sessions 11-21)

1. **`.env` prod jamais rsync**
2. **`trust proxy 1`** ne pas retirer
3. **qa-lexa 17/17 baseline** — si un test fail, investiguer avant push
4. **HMAC Pro→Lexa** : ne jamais JSON.stringify deux fois
5. **JWT override req.tenantId** — header `X-Tenant-Id` ignoré sur routes protégées
6. **Disclaimer PDF/XML obligatoire**
7. **deepseek-ocr sur Spark** : ne jamais décharger avec keep_alive=0
8. **LEXA_ENABLED=true côté Pro** : ne jamais passer à false
9. **Backend = tsx watch src/** (pas dist compilé) — découvert session 17
10. **Templates YAML dans src/execution/templates/** — copier dans src lors du rsync
11. **BLV VD htmlId** : si le Canton VD met à jour la loi, appeler l'endpoint CONSOLIDE pour obtenir le nouveau htmlId
12. **cantonFR stub** : `submitDraft = lexa.submitTaxpayerDraftVd` — REMPLACER session 22 avec `submitTaxpayerDraftFr`

---

**Derniere mise a jour** : 2026-04-15 (fin session 22.5 — binding NE/JU/BJ, 10 agents actifs, qa-lexa 21/21)
