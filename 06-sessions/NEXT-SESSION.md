# NEXT SESSION — Point de reprise

**Dernière session** : [Session 24.5 — 2026-04-16](2026-04-16-session-24-5.md) (benchmark OCR, infra)
**Prochaine session** : Session 25 — À décider (options ci-dessous)

> Session 24 a livré l'auto-fill wizard depuis documents OCR : DocumentMapper, route apply-to-draft, field-sources, badges wizard, PDF de test stable. qa-lexa **23/23** (cible).

---

## Ce qui marche après session 24

| Composant | Etat |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | OK |
| Auth JWT + rate limit + trust proxy 1 | OK |
| HMAC Pro Lexa + classify auto | OK |
| **MongoDB GridFS** | |
| `lexa-documents` DB sur `127.0.0.1:27017` | OK session 23 |
| Collection `documents_meta` (metadata + ocrResult + appliedToDrafts) | OK |
| **Pipeline OCR** | |
| Stage 1 pdf-parse + Stage 2 classification | OK session 23 |
| Types : certificat_salaire, attestation_3a, facture, releve_bancaire, autre | OK |
| **Routes documents** | |
| `POST /documents/upload` | OK session 23 |
| `GET /documents` liste tenant | OK session 23 |
| `POST /documents/:id/apply-to-draft` | **OK session 24** |
| Event `DocumentAppliedToDraft` dans event store | **OK session 24** |
| Provenance `appliedToDrafts[]` dans Mongo | **OK session 24** |
| **Routes taxpayers** | |
| `GET /taxpayers/draft/:year/field-sources` | **OK session 24** |
| **Frontend** | |
| Page `/documents` bouton "Pré-remplir wizard" | **OK session 24** |
| Feedback apply (succès/erreur + lien wizard) | **OK session 24** |
| Wizard badges "📎 extrait de X" Step2 + Step4 | **OK session 24** |
| **Services** | |
| `DocumentMapper.ts` pure function | **OK session 24** |
| `setDeep(obj, path, value)` pour state patch | **OK session 24** |
| **Wizard contribuable** | |
| Wizard PP VS/GE/VD/FR | OK sessions 15-22 |
| **Knowledge base** | |
| Qdrant `swiss_law` 9846 pts | OK |
| **Agents actifs (10)** | classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/ne/ju/bj |
| **Tests auto** | |
| qa-lexa **23/23** | **OK session 24** |
| PDF de test stable embarqué (2.2 KB) | **OK session 24** |

---

## Options session 25 — Décision mère

### Option A — Fiscal-PM (Sàrl/SA) + wizard + agent (GROS MORCEAU)

**Effort estimé** : 2 sessions (25 + 26)
**Impact marché** : 40% de la cible (PME Sàrl/SA)

Ce qui est nécessaire :
1. Wizard PM 4 steps : identité société (UID, raison sociale, canton), revenus (CA, résultat), charges, impôts
2. Agent fiscal-pm-vs (impôt bénéfice + capital VS)
3. FormBuilder + PDF VS-PM
4. Connaissance base : LIFD art. 57-68, LHID art. 24-26, circulaires AFC PM

**Valeur** : couvre les 3-5 Sàrl romandes par mois de la cible commerciale

### Option B — Agent Conseiller IA ("et si ?")

**Effort estimé** : 1 session
**Impact** : feature whitepaper §1.4 — simulateur fiscal proactif

Fonctionnalités :
1. Agent `conseiller` : "Et si tu augmentais ta 3a de X ?" → simulation d'impact sur impôt estimé
2. Optimisations LPP/3a/amortissements suggérées
3. Interface chat dans le wizard (sidebar)
4. Sources citées (articles LIFD/LHID)

**Valeur** : différentiateur fort, "magie" du whitepaper §1.4

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→24)

1-32. (voir archive session 23)
33. **Paths wizard corrects** : `step2.salaireBrut` (pas `income.salary`), `step4.pilier3a` (pas `deductions.pilier3a`)
34. **`fiscal_year`** dans `taxpayer_drafts` (pas `year`) — toujours utiliser ce nom de colonne
35. **streamId = UUID valide obligatoire** dans EventStore — si documentId non-UUID, générer un `randomUUID()` pour le streamId
36. **Draft n'a pas de colonne `canton`** — le canton est dans `state.step1.canton` ou `taxpayer_profiles.canton`

---

## Dette technique — Session 24.5

### OCR : Benchmark incomplet (priorité session 25)

Le benchmark qwen3-vl-ocr vs deepseek-ocr (session 24.5) n'a pas pu être finalisé :
- **Cause 1** : PDF envoyé directement à Ollama `images[]` → HTTP 500. Corrigé : utiliser PNG.
- **Cause 2** : `pdf-parse@1.1.1` incompatible avec PDF PDFKit (`bad XRef entry`). À corriger.
- **Cause 3** : Réseau 192.168.110.0/24 inaccessible depuis la machine locale en fin de session.

**À faire session 25 (5 min)** :
```bash
rsync -avz apps/backend/src/scripts/bench-ocr.ts \
           apps/backend/src/scripts/fixtures/test-cert-salaire-1.png \
           swigs@192.168.110.59:/home/swigs/lexa-backend/src/scripts/fixtures/
# Copier le PNG aussi dans src/scripts/ (pour le path du script)
ssh swigs@192.168.110.59 'cp /home/swigs/lexa-backend/src/scripts/fixtures/test-cert-salaire-1.png /home/swigs/lexa-backend/src/scripts/'
ssh swigs@192.168.110.59 'cd /home/swigs/lexa-backend && OLLAMA_URL=http://192.168.110.103:11434 npx tsx src/scripts/bench-ocr.ts'
```

### pdf-parse incompatible avec PDFKit (impact prod)

`pdf-parse@1.1.1` lève `bad XRef entry` sur les PDF PDFKit. En production, **tous les PDF PDFKit**
envoyés par les clients tombent sur le fallback vision (qwen3-vl-ocr) même s'ils ont du texte embarqué.
Solution : remplacer `pdf-parse` par `pdfjs-dist` ou `pdf2json`.

---

## Avertissements (héritage sessions 11-24.5)

1. **`.env` prod jamais rsync**
2. **`trust proxy 1`** ne pas retirer
3. **qa-lexa 23/23 baseline** — si un test fail, investiguer avant push
4. **HMAC Pro→Lexa** : ne jamais JSON.stringify deux fois
5. **JWT override req.tenantId** — header `X-Tenant-Id` ignoré sur routes protégées
6. **Disclaimer PDF/XML obligatoire**
7. **qwen3-vl-ocr sur Spark** : output JSON non-déterministe, utiliser `parseOcrModelOutput()`
8. **LEXA_ENABLED=true côté Pro** : ne jamais passer à false
9. **Backend = tsx watch src/** (pas dist compilé)
10. **Templates YAML dans src/execution/templates/**
11. **MONGO_URL = mongodb://127.0.0.1:27017** (loopback, pas IP réseau)
12. **Rate limit login** : le rate limit est strict côté prod — utiliser `http://localhost:3010` depuis le serveur pour les tests
13. **Ollama images[] = PNG/JPEG uniquement** — ne jamais envoyer un PDF brut en base64, Ollama retourne HTTP 500
14. **test-cert-salaire-1.png** = fixture correcte pour tests vision OCR (150 KB, 1 page A4)

---

**Dernière mise à jour** : 2026-04-16 (session 24.5 — benchmark OCR préparé, dette pdf-parse documentée, NEXT-SESSION enrichi)
