# Rapport Benchmark Phase 2 — apolo13x/Qwen3.5-35B-A3B-NVFP4

**Date** : 2026-04-21T11:13:50Z  
**Modèle** : `apolo13x/Qwen3.5-35B-A3B-NVFP4`  
**Endpoint** : `http://localhost:8100`  
**Total cas** : 60  

## Résultats par catégorie

| Catégorie | N | Accuracy | TTFT p50 (ms) | tokens/s p50 | Latence E2E p50 (ms) | Latence E2E p95 (ms) | Pass/Fail |
|-----------|---|----------|---------------|--------------|----------------------|----------------------|-----------|
| chat-streaming | 10 | 0% | 92 | 38.5 | 5950 | 10816 | ❌ FAIL |
| classifier-kafer | 10 | 0% | 103 | 38.4 | 5310 | 5331 | ❌ FAIL |
| json-wizard | 20 | 0% | 118 | 38.5 | 5323 | 10559 | ❌ FAIL |
| rag-fiscal | 20 | 5% | 90 | 38.4 | 9206 | 13241 | ❌ FAIL |

## Résumé global

- **Accuracy globale** : 1.7% (1/60)
- **Verdict** : ❌ FAIL — baisse de qualité détectée, NE PAS déployer

## Cas échoués

| ID | Catégorie | Score | Seuil | Erreur |
|----|-----------|-------|-------|--------|
| rag-001 | rag-fiscal | 0.67 | 0.75 |  |
| rag-002 | rag-fiscal | 0.28 | 0.75 |  |
| rag-003 | rag-fiscal | 0.14 | 0.75 |  |
| rag-004 | rag-fiscal | 0.28 | 0.75 |  |
| rag-005 | rag-fiscal | 0.00 | 0.75 |  |
| rag-006 | rag-fiscal | 0.14 | 0.75 |  |
| rag-007 | rag-fiscal | 0.50 | 0.75 |  |
| rag-008 | rag-fiscal | 0.14 | 0.75 |  |
| rag-009 | rag-fiscal | 0.00 | 0.75 |  |
| rag-010 | rag-fiscal | 0.28 | 0.75 |  |
| rag-011 | rag-fiscal | 0.23 | 0.75 |  |
| rag-012 | rag-fiscal | 0.25 | 0.75 |  |
| rag-014 | rag-fiscal | 0.25 | 0.75 |  |
| rag-015 | rag-fiscal | 0.40 | 0.75 |  |
| rag-016 | rag-fiscal | 0.60 | 0.75 |  |
| rag-017 | rag-fiscal | 0.35 | 0.75 |  |
| rag-018 | rag-fiscal | 0.23 | 0.75 |  |
| rag-019 | rag-fiscal | 0.00 | 0.75 |  |
| rag-020 | rag-fiscal | 0.60 | 0.75 |  |
| wiz-001 | json-wizard | 0.30 | 0.90 |  |

## Seuils de performance

| Métrique | Valeur mesurée | Seuil | Status |
|----------|----------------|-------|--------|
| TTFT p50 | 105 ms | ≤ 2000 ms | ✅ |
| tokens/s p50 | 38.4 | ≥ 20 | ✅ |
| Latence E2E p95 | 10589 ms | ≤ 30000 ms | ✅ |
