# Session 34 — Swissdec Salaires : KB + OCR enrichi + Certificat de salaire Form 11

**Date** : 2026-04-16
**Durée** : ~3h
**Modèle** : claude-sonnet-4-6 (Lexa dev)
**Score MVP avant** : ~99.5%
**Score MVP après** : ~99.5% (consolidation, +1 brique Swissdec)

---

## Bloc 0 — Gate infra

- Git pull : déjà à jour (clean tree)
- Qdrant avant : 9854 points — OK (≥ 9854 attendu)
- Health check : `ok: True | services.qdrant: true | services.ollama: true`
- Backend prod : `lexa-backend` online (PM2)

---

## Bloc A — OCR enrichi Swissdec

### Modification : `OcrExtractor.ts` prompt stage 2

**Avant** (schema certificat_salaire) :
```
- certificat_salaire : { employer, employeeName, grossSalary, netSalary, year, period, avsLpp }
```

**Après** (schema Swissdec enrichi) :
```
- certificat_salaire : cases Swissdec 1-15 normalisées :
  case1_salaireBrut, case7_autresPrestations, case8_totalBrut,
  case9_cotisationsSociales, case10_lppOrdinaire, case11_lppRachats,
  case12_autresDeductions, case13_fraisEffectifs, case14_prestationsNonSoumises,
  case15_remarques
  + agrégats legacy : grossSalary, netSalary, avsLpp (compatibilité)
```

### Génération fixture PDF Swissdec (`gen-test-cert-salaire.ts`)

**Avant** : PDF avec libellés génériques ("Salaire brut annuel", "Déductions AVS/AI/APG")

**Après** : PDF avec cases Swissdec explicites :
```
Case 1 - Salaire annuel brut soumis AVS : CHF 85'000.00
Case 8 - Total salaire brut : CHF 85'000.00
Case 9 - Cotisations AVS/AI/APG/AC (employé) : CHF 5'525.00
Case 10 - Cotisations LPP ordinaires : CHF 5'250.00
Case 12 - Autres déductions : CHF 0.00
Case 13 - Frais effectifs remboursés : CHF 0.00
```

**Fichier** : `apps/backend/src/scripts/fixtures/test-cert-salaire.pdf` (mis à jour)

---

## Bloc B — KB Swissdec Guidelines

### Source PDF

Source officielle Swissdec Guidelines 5.0.2 non accessible programmatiquement
(portail partenaires, authentication requise).
**Fallback** : corpus interne de référence structuré basé sur :
- Contenu public AFC Suisse (formulaire 11 officiel)
- Directives Swissdec publiées
- LIFD art. 127
- `source_confidence: medium`

### Script créé

`01-knowledge-base/scripts/ingest_swissdec_guidelines.py`

**Corpus** : 33 chunks (cases 1-15 individuelles + sections annexes)
- Cases détaillées : case_1, case_1_detail, case_2_3, case_4_5_6, case_7, case_7_13eme, case_8, case_9, case_9_taux, case_10, case_10_seuils, case_11, case_12, case_13, case_14, case_15
- Sections : AVS base légale, LPP 2ème pilier, impôt à la source, prestations nature, transmission ELM, pilier 3a interaction, frais pro, allocations familiales, calcul net, obligations délais, rectification, différences cantonales, participation collaborateurs

### Résultat ingestion

```
Points avant : 9854
Chunks ingérés : 33
Points après : 9887 (delta: +33)
Cible ≥ 30 : ATTEINT
```

### Tests RAG

| Query | Citations Swissdec | Top match | Pass |
|---|---|---|---|
| "Case 7 bonus 13ème salaire Swissdec" | 1 | `case_7_13eme` | ✅ |
| "Case 9 cotisations AVS/AI/APG/AC employé" | 4 | `case_9_taux` | ✅ |
| "Certificat de salaire obligation déclaration" | 4 | `introduction` | ✅ |

**RAG : 3/3** ✅

---

## Bloc C — SwissdecCertificateBuilder

### Fichiers créés

**`apps/backend/src/execution/SwissdecCertificateBuilder.ts`** :
- Zod schema `CertificateInput` (employer, employee, year, period, cases 1-15)
- `buildSwissdecCertificate(input)` → `{ pdfBase64, structuredData, citations, generatedAt }`
- Rendu PDF pdfkit : header AFC, sections employer/employee/period, tableau cases Swissdec avec numérotation colorée, total net calculé, disclaimer + citation légale LIFD art. 127 + Swissdec 5.0

### Route ajoutée

`POST /forms/swissdec-certificate` dans `apps/backend/src/routes/forms.ts`
- `requireAuth` middleware
- Retour `{ pdfBase64, structuredData, citations, generatedAt }`

### Smoke test prod

```bash
POST https://lexa.swigs.online/api/forms/swissdec-certificate
{
  employer: { legalName: "Lexa Test SA", address: "...", ideNumber: "CHE-100.200.300" },
  employee: { firstName: "Jean", lastName: "TEST", avsNumber: "756.1234.5678.97" },
  year: 2026, period: { start: "2026-01-01", end: "2026-12-31" },
  cases: { case1_salaireBrut: 85000, case8_totalBrut: 85000,
           case9_cotisationsSociales: 5525, case10_lppOrdinaire: 5250 }
}
```

**Résultat** :
```
pdfLen: 4632 (> 1500 ✅)
case1: 85000 ✅
case8: 85000 ✅
case9: 5525 ✅
computedNet: 74225
citations: ['LIFD', 'Swissdec-Guidelines'] ✅
formId: swissdec-lohnausweis-form11
generatedAt: 2026-04-16T09:39:54.251Z ✅
```

---

## Bloc D — qa-lexa

### Nouvelle fixture

`swissdec-1-certificate-generation` (kind: `swissdec`) ajoutée dans `qa-lexa.ts`.
Asserts : HTTP 200, pdfBase64.length > 1500, case1=85000, case8=85000, case9=5525, citations Swissdec présentes.

### Résultat qa-lexa

```
total: 38  |  pass: 38  |  fail: 0  |  passRate: 100%
```

**Baseline préservée + 1 nouvelle fixture PASS** ✅

Détail swissdec kind : total=1, passed=1, avgLatencyMs=19ms

---

## Score MVP

**~99.5%** (stable — consolidation Swissdec, pas de régression)

---

## Dettes S35+

1. **Transmission électronique Swissdec** : eCH-0217 XML export, e-transfer AFC — V2
2. **XML ELM 5.0** : format d'échange salarial avec caisses AVS/LPP — V2
3. **Pipeline OCR → Builder automatique** : upload PDF certificat → extraction cases → pré-remplissage Builder — S35+
4. **Calcul paie automatique** : AVS/LPP/IS à partir des paramètres employé/employeur — V2
5. **5 dettes barèmes** Lane B (VS PP tranches hautes, VD/FR PP tabulaire, VS/GE mariés, FR PM capital) — S35+
6. **Structure réponse simulate** + qa-lexa complet re-validé post-S33 — hors scope S34

---

## Fichiers impactés

- `apps/backend/src/services/OcrExtractor.ts` — prompt stage 2 enrichi Swissdec
- `apps/backend/src/execution/SwissdecCertificateBuilder.ts` — **NOUVEAU** Form 11 PDF generator
- `apps/backend/src/routes/forms.ts` — +POST /forms/swissdec-certificate
- `apps/backend/src/scripts/gen-test-cert-salaire.ts` — fixture PDF avec cases Swissdec
- `apps/backend/src/scripts/fixtures/test-cert-salaire.pdf` — PDF mis à jour
- `apps/backend/src/scripts/qa-lexa.ts` — +1 fixture swissdec + kind type
- `01-knowledge-base/scripts/ingest_swissdec_guidelines.py` — **NOUVEAU** script ingestion 33 chunks
- `01-knowledge-base/INDEX.md` — +Swissdec entry, points 9854 → 9887
