# NEXT SESSION — Point de reprise

**Dernière session** : [Session 23 — 2026-04-15](2026-04-15-session-23.md)
**Prochaine session** : Session 24 — Auto-fill wizard depuis documents uploadés

> Session 23 a livré le pipeline OCR end-to-end : MongoDB GridFS, OcrExtractor 2-stages (pdf-parse + qwen3-vl-ocr + qwen3.5:9b-optimized), routes POST/GET /documents, page /documents frontend, event DocumentUploaded. qa-lexa **22/22** passRate 100%.

---

## Ce qui marche après session 23

| Composant | Etat |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | OK |
| Auth JWT + rate limit + trust proxy 1 | OK |
| HMAC Pro Lexa + classify auto | OK |
| HMAC Lexa Pro (webhook retour) | OK session 20 |
| **MongoDB GridFS** | |
| `lexa-documents` DB sur `127.0.0.1:27017` | OK session 23 |
| Collection `documents_meta` (metadata + ocrResult) | OK |
| Collection `documents.files` + `documents.chunks` (GridFS) | OK |
| `services.mongo: true` dans health | OK |
| **Pipeline OCR** | |
| Stage 1 pdf-parse (PDFs texte-embedded) | OK session 23 |
| Stage 1 qwen3-vl-ocr (images + PDFs scannés) | OK session 23 |
| `parseOcrModelOutput()` format JSON non-déterministe | OK session 23 |
| Stage 2 qwen3.5:9b-optimized (classification + champs) | OK session 23 |
| Types : certificat_salaire, attestation_3a, facture, releve_bancaire, autre | OK |
| **Routes documents** | |
| `POST /documents/upload` multipart JWT 10MB | OK session 23 |
| `GET /documents` liste tenant | OK session 23 |
| `GET /documents/:id` metadata | OK session 23 |
| `GET /documents/:id/binary` stream GridFS | OK session 23 |
| Event `DocumentUploaded` dans event store Postgres | OK session 23 |
| **Frontend** | |
| Page `/documents` upload + liste + champs extraits | OK session 23 |
| Bouton Documents dans Workspace navbar | OK session 23 |
| **Wizard contribuable** | |
| Wizard PP VS 6 steps sur `/taxpayer/:year` | OK session 15 |
| Wizard PP GE 6 steps sur `/taxpayer/ge/:year` | OK session 21 |
| Wizard PP VD 6 steps sur `/taxpayer/vd/:year` | OK session 21 |
| Wizard PP FR 6 steps sur `/taxpayer/fr/:year` | OK session 22 Lane A |
| **Knowledge base** | |
| Canton VS (339 articles) | OK |
| Canton GE (373 articles) | OK |
| Canton VD (381 articles) | OK |
| Canton FR (1035 articles) | OK |
| Canton NE/JU/BJ | OK session 22.5/25 |
| Qdrant `swiss_law` | **9846 pts** |
| **Agents actifs (10)** | classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/ne/ju/bj |
| **Tests auto** | |
| qa-lexa **22/22** via HTTP localhost | OK **session 23** |

---

## Priorite session 24 — Auto-fill wizard depuis documents

### 1. Service DocumentToWizardMapper (~45 min)

Pour chaque type OCR, mapper les champs vers les fields wizard :
- `certificat_salaire.grossSalary` → wizard step2 `revenue.salaireAnnuel`
- `certificat_salaire.employer` → wizard step1 `employeur`
- `attestation_3a.amount` → wizard step4 `deductions.pilier3a`
- `facture.amountTtc` → transaction candidate (via classify)

Service `DocumentMapper.ts` : `mapDocumentToWizardPatch(ocrResult, canton)` → `TaxpayerDraftPatch[]`

### 2. Route POST /documents/:id/apply-to-wizard (~30 min)

- Lit `documents_meta.ocrResult.extractedFields`
- Appelle `mapDocumentToWizardPatch()`
- Appelle PATCH /taxpayers/draft/field pour chaque field mappé
- Retourne `{ applied: [{field, value}], skipped: [{field, reason}] }`

### 3. Frontend — bouton "Remplir wizard" (~30 min)

Dans la DocumentCard, ajouter un bouton "Remplir wizard" qui appelle la route ci-dessus
et toast les champs appliqués.

### 4. Test qa-lexa fixture OCR réelle (~30 min)

Remplacer `documents-1-list-route` par un vrai test d'upload avec assertion sur `ocrResult.type`,
en utilisant un document de référence stable (créé depuis le PDF de test session 23).

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→23)

1-29. (voir archive session 23)
30. **MongoDB écoute sur 127.0.0.1:27017** — MONGO_URL doit être `mongodb://127.0.0.1:27017` dans `.env` prod
31. **qwen3-vl-ocr sortie JSON non-déterministe** — toujours passer par `parseOcrModelOutput()`
32. **Fixture qa-lexa OCR** : le modèle plante sur images synthétiques trop petites — tester via liste plutôt qu'upload pour les tests auto

---

## Avertissements (héritage sessions 11-23)

1. **`.env` prod jamais rsync**
2. **`trust proxy 1`** ne pas retirer
3. **qa-lexa 22/22 baseline** — si un test fail, investiguer avant push
4. **HMAC Pro→Lexa** : ne jamais JSON.stringify deux fois
5. **JWT override req.tenantId** — header `X-Tenant-Id` ignoré sur routes protégées
6. **Disclaimer PDF/XML obligatoire**
7. **qwen3-vl-ocr sur Spark** : output JSON non-déterministe, utiliser `parseOcrModelOutput()`
8. **LEXA_ENABLED=true côté Pro** : ne jamais passer à false
9. **Backend = tsx watch src/** (pas dist compilé)
10. **Templates YAML dans src/execution/templates/**
11. **MONGO_URL = mongodb://127.0.0.1:27017** (loopback, pas IP réseau)

---

**Derniere mise a jour** : 2026-04-15 (fin session 23 — pipeline OCR, MongoDB GridFS, 22/22 qa-lexa)
