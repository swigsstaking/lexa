# Session 22.5 — Binding agents NE/JU/BJ

**Date** : 2026-04-15
**Durée** : ~45 min (sequentielle, Lane A + Lane B deja livrees)
**Scope** : Cables les 3 agents TS backend pour cantons NE, JU, BJ

---

## Bloc 0 — Gate infra

| Check | Resultat |
|---|---|
| Git clean, branch main | OK |
| Health HTTPS | ok=true, 4 services verts |
| Qdrant swiss_law | **9846 pts** |
| GET /agents avant | **7 agents** |
| Ollama Spark (192.168.110.103:11434) | **11 modeles lexa** dont lexa-fiscal-pp-ne, lexa-fiscal-pp-ju, lexa-fiscal-pp-bj |
| Round-trip auth (register + login probe) | OK, JWT acquis |

---

## Bloc A — 3 agents TS

### Valeurs `law` extraites des scripts Lane B

| Canton | Fichier | Valeurs law |
|---|---|---|
| NE | ingest_ne_laws_lexa.py | `LCdir-NE`, `RGI-NE`, `ORD-FP-NE` |
| JU | ingest_ju_laws_lexa.py | `LI-JU` (RSJU 641.11) |
| BJ | ingest_bj_laws_lexa.py | `LI-BE`, `OI-BE` (RSB 661.11/661.111 version FR) |

### Fichiers crees

- `apps/backend/src/agents/fiscalPpNe/FiscalPpNeAgent.ts`
- `apps/backend/src/agents/fiscalPpJu/FiscalPpJuAgent.ts`
- `apps/backend/src/agents/fiscalPpBj/FiscalPpBjAgent.ts`

Pattern identique a FiscalPpFrAgent : enrichQuestion + Qdrant top 8 + rankXxxTaxSources + Ollama generate + citations.

---

## Bloc B — Routes + GET /agents

- 3 routes ajoutees : POST /agents/fiscal-pp-ne/ask, POST /agents/fiscal-pp-ju/ask, POST /agents/fiscal-pp-bj/ask
- Schema Zod avec status/netIncome/commune/civilStatus/isPropertyOwner
- GET /agents : **10 agents actifs** confirmes apres sync

---

## Bloc C — Smoke HTTPS 3 agents

| Canton | model | citations | duration_ms | "7 260" present |
|---|---|---|---|---|
| NE | lexa-fiscal-pp-ne | 5 | 15225ms | oui |
| JU | lexa-fiscal-pp-ju | 5 | 12712ms | oui |
| BJ | lexa-fiscal-pp-bj | 5 | 14714ms | oui |

Tous < 25s. Plafond 7260 CHF cite dans les 3 reponses.

---

## Bloc D — qa-lexa 21/21

### Bykinds

| Kind | total | passed | avgLatencyMs |
|---|---|---|---|
| classify | 5 | 5 | 30097ms |
| tva | 3 | 3 | 7421ms |
| fiscal-pp-vs | 2 | 2 | 11684ms |
| fiscal-pp-ge | 1 | 1 | 12996ms |
| fiscal-pp-vd | 1 | 1 | 13283ms |
| fiscal-pp-fr | 1 | 1 | 9325ms |
| **fiscal-pp-ne** | **1** | **1** | **9580ms** |
| **fiscal-pp-ju** | **1** | **1** | **12966ms** |
| **fiscal-pp-bj** | **1** | **1** | **12083ms** |
| taxpayer | 5 | 5 | 50ms |

**Total : 21/21, passRate 100%, 0 fail, 0 regression.**

### Non-regression wizards

- /taxpayer/2026 -> 200
- /taxpayer/ge/2026 -> 200
- /taxpayer/vd/2026 -> 200
- /taxpayer/fr/2026 -> 200

### Commits

- `5f913b9` feat(agents): FiscalPpNeAgent + FiscalPpJuAgent + FiscalPpBjAgent — 10 agents actifs
- `1160219` test(qa-lexa): +3 fixtures fiscal-pp-{ne,ju,bj} — 21/21 baseline
- (commit 3 ce fichier)

---

## Score MVP estime

Avant session 22.5 (apres Lane A + Lane B) : ~73%
Apres session 22.5 :
- Agents connus (Knowledge) : 4 cantons PP actifs → +3 (NE/JU/BJ)
- Agents actifs : 10/10 → contribution coverage suisse-romande complete

Estimation post-binding : **~78%**
(Reasoning +5 cumulatif KB NE/JU/BJ, Knowledge +3 cantons)

---

## Dettes tracees — Session 23 : OCR Pipeline

- MongoDB GridFS + upload endpoint multipart
- deepseek-ocr integration : POST /documents/upload
- Document model (tenant-isolated, status, rawText, extractedData)
- Linkage Invoice/Expense → Document via documentId
- Session 23 prioritaire pour features comptable v2
