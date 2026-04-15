# NEXT SESSION — Point de reprise

**Dernière session** : [Session 21 — 2026-04-15](2026-04-15-session-21.md)
**Prochaine session** : Session 22 — Wizard PP FR complet + harmoniser VS en CantonConfig

> Session 21 a livré le refactoring wizard GE+VD en générique (`TaxpayerWizardCanton`) + ingestion Canton Fribourg (LICD/LIC/ORD-FP, +1035 chunks) + agent `lexa-fiscal-pp-fr`. qa-lexa **17/17** passRate 100%.

---

## Ce qui marche après session 21

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | ✅ |
| Auth JWT + rate limit + trust proxy 1 | ✅ |
| HMAC Pro→Lexa + classify auto | ✅ |
| HMAC Lexa→Pro (webhook retour) | ✅ session 20 |
| **Wizard contribuable** | |
| Wizard PP VS 6 steps sur `/taxpayer/:year` | ✅ session 15 (à migrer session 22) |
| Wizard PP GE 6 steps sur `/taxpayer/ge/:year` | ✅ session 21 (TaxpayerWizardCanton) |
| Wizard PP VD 6 steps sur `/taxpayer/vd/:year` | ✅ session 21 (TaxpayerWizardCanton) |
| **Wizard PP FR** — stub config seulement | ⚠️ session 22 |
| **Knowledge base** | |
| Canton VS (339 articles) | ✅ |
| Canton GE (373 articles) | ✅ |
| Canton VD (381 articles) | ✅ |
| **Canton FR (1035 articles LICD/LIC/ORD-FP)** | ✅ **session 21** |
| Qdrant `swiss_law` | **7178 pts** |
| **Agents actifs** | classifier, reasoning, tva, fiscal-pp-vs, fiscal-pp-ge, fiscal-pp-vd, **fiscal-pp-fr** |
| **Tests auto** | |
| qa-lexa **17/17** via localhost | ✅ **session 21** |

---

## Priorité session 22 — ordre strict

### 1. Wizard PP FR complet (~2h30)

Le stub `config/cantons/fr.ts` est en place. Il faut:

1. **Données communes FR** : créer `/data/communes-fr.ts` avec les principales communes + coefficients communaux 2026 (SCC FR publie ces données)
2. **`FrPpFormBuilder.ts`** : clone de `VdPpFormBuilder`, constantes FR (fraisProMin=1700, fraisProMax=3400)
3. **`FrPpPdfRenderer.ts`** : clone de `VdPpPdfRenderer`, header "Déclaration d'impôt PP Fribourg — 2026"
4. **Template YAML** `fr-declaration-pp-2026.yaml`
5. **Routes** `POST /forms/fr-declaration-pp` + `POST /taxpayers/draft/submit-fr`
6. **`lexa.submitTaxpayerDraftFr`** dans l'API client
7. **Mettre à jour `cantonFR`** : communes réelles + `submitDraft = lexa.submitTaxpayerDraftFr`
8. **Route** `/taxpayer/fr/:year` dans `App.tsx`
9. **Bouton "Déclaration PP"** canton-aware étendu à FR dans Workspace.tsx

### 2. Migrer le Wizard VS en TaxpayerWizardCanton (~1h)

- Créer `config/cantons/vs.ts` avec `cantonVS` (cantonCode='VS', fraisProMin=?, fraisProMax=?)
- Remplacer `TaxpayerWizard.tsx` → `TaxpayerWizardCanton` avec `canton={cantonVS}`
- Route `/taxpayer/:year` → `/taxpayer/vs/:year` (redirection ou alias)
- Supprimer les vieux composants VS (Step*Vs.tsx)

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

**Dernière mise à jour** : 2026-04-15 (fin session 21 — Fribourg KB + agent + wizard générique GE+VD, qa-lexa 17/17)
