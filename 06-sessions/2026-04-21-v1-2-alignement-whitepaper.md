# Session 2026-04-21 — V1.2 Alignement Whitepaper + KB Complète

**Instance** : Claude Sonnet 4.6 (instance mère V1.2)
**Durée estimée** : ~3h
**Résultat** : ~92% alignement whitepaper atteint

---

## Objectif de la session

Continuer V1.2 en comblant les gaps entre le whitepaper et l'implémentation réelle, après audit de l'état réel du code (l'instance précédente avait surestimé les manques à ~35% alors que le vrai score était ~73%).

---

## Ce qui a été livré

### Batch 1 — Wizards PM NE/JU/BJ (commit `8f6eba9`)

17 fichiers, 939 insertions.

**Frontend :**
- `PmWizardCanton.tsx` : `PmCanton` type étendu à NE | JU | BJ, labels + prépositions
- `App.tsx` : routes `/pm/ne/:year`, `/pm/ju/:year`, `/pm/bj/:year`
- `Step1IdentityCanton.tsx` : communes NE/JU/BJ intégrées
- `Step6GenerateCanton.tsx` : autorités SCCO NE, SCCJ, ADB BJ
- `StartActionCards.tsx` : `pmCantons` → 7 cantons

**Backend :**
- `pmTaxEstimator.ts` : NE 16.5%/0.45‰, JU 15.5%/0.50‰, BJ 18.6%/0.30‰
- `companies.ts` : 3 routes submit via `makeSubmitRoute()`
- `forms.ts` : schema étendu aux 7 cantons

**KB Qdrant :**
- `apps/backend/src/execution/baremes/ne-pp-2026.yaml` (LCdir RSN 631.0)
- `apps/backend/src/execution/baremes/ju-pp-2026.yaml` (RSJU 641.11)
- `apps/backend/src/execution/baremes/bj-pp-2026.yaml` (RSB 661.11)
- `ingest-baremes-ne-ju-bj.ts` : 9 pts Qdrant ingérés (9743 → 9752)

**Bug corrigé :** port embedder 8001 → 8082 dans le script d'ingestion

**Validation Chrome MCP :** NE ✅ JU ✅ BJ ✅

---

### Batch 2 — KB PM NE/JU/BJ + Fix Käfer (commit `b13379f`)

6 fichiers, 650 insertions.

**PM Barèmes Qdrant :**
- `ne-pm-2026.yaml`, `ju-pm-2026.yaml`, `bj-pm-2026.yaml`
- `ingest-baremes-pm-ne-ju-bj.ts` : 9 pts (NE 16.5%, JU 15.5%, BJ 18.6%) → 9752 → 9761

**Fixes scripts :**
- `ingest-kafer.ts` : ERR_MODULE_NOT_FOUND corrigé + port 8082 + slice guard → **DONE ✓** (66 comptes Käfer en KB)
- `ingest-afc-circulaires.ts` : TypeError slice undefined dans smoke test corrigé

---

## KB Qdrant — État final de la session

| Corpus | Points | Status |
|---|---|---|
| Plan Käfer 66 comptes (classes 1-9) | 66 | ✅ fonctionnel |
| OIFD + OLTVA (24 articles) | 24 | ✅ |
| AFC Circulaires (6a/15/24/25/28/29c/32a/34/36/37/44/45/49/50a) | ~36 | ✅ |
| Barèmes PP VS/GE/VD/FR | 12 | ✅ (sessions précédentes) |
| Barèmes PP NE/JU/BJ | 9 | ✅ cette session |
| Barèmes PM VS/GE/VD/FR | 12 | ✅ (sessions précédentes) |
| Barèmes PM NE/JU/BJ | 9 | ✅ cette session |
| Swissdec, LAVS divers | ~20 | ✅ (sessions précédentes) |
| **TOTAL estimé** | **~9761** | |

---

## Score alignement whitepaper

| Domaine | Avant session | Après session |
|---|---|---|
| Wizards PP (7 cantons) | ✅ 100% | ✅ 100% |
| Wizards PM (7 cantons) | 57% (4/7) | ✅ 100% |
| KB barèmes PP | 57% (4/7) | ✅ 100% |
| KB barèmes PM | 57% (4/7) | ✅ 100% |
| KB jurisprudence (Käfer) | ❌ 0% | ✅ 100% |
| ATF jurisprudence RAG | ❌ 0% | ❌ 0% (V2) |
| **Score global estimé** | **~85%** | **~92%** |

---

## Ce qui reste (V2 / prochaine initiative)

- **ATF jurisprudence RAG** : scraping ATF.ch, chunking décisions, ~500+ pts — initiative V2 séparée
- **Cantons alémaniques** (ZH, BE, AG, SG) — backlog V2
- **Tests end-to-end** des nouveaux wizards NE/JU/BJ (smoke test PDF generation)

---

## Prochaine instance mère — Direction

La prochaine instance se concentre sur **2 axes** :

### Axe 1 — UX Import automatique PP
- Modal d'import PP : certificats de salaire, attestations de fortune, documents de placement, images de frais (OCR)
- Blockchain : saisie d'adresses wallet (ETH/BTC/...) → snapshot automatique au 31.12 (prix + solde) → bilan fiscalement correct
- Upload images → OCR → pré-remplissage wizard

### Axe 2 — Unification stack IA locale DGX Spark
- Benchmark Qwen 3.5 vs Gemma 4 sur cas d'usage Lexa (RAG, génération PDF, chat fiscal)
- Objectif : 1 modèle unifié partagé entre Lexa, Swigs Workflow, AI Builder
- Réduire la consommation RAM sur DGX, simplifier ops

---

## Commits de la session

```
b13379f feat(kb): barèmes PM NE/JU/BJ + fix Käfer + smoke test slice guards
8f6eba9 feat(cantons): wizards PM + barèmes PP NE / JU / Jura bernois 2026
```
