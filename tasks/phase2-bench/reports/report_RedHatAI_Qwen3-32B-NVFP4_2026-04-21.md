# Rapport Benchmark Phase 2 — RedHatAI/Qwen3-32B-NVFP4

**Date** : 2026-04-21T10:44:53Z  
**Modèle** : `RedHatAI/Qwen3-32B-NVFP4`  
**Endpoint** : `http://localhost:8100`  
**Total cas** : 60  

## Résultats par catégorie

| Catégorie | N | Accuracy | TTFT p50 (ms) | tokens/s p50 | Latence E2E p50 (ms) | Latence E2E p95 (ms) | Pass/Fail |
|-----------|---|----------|---------------|--------------|----------------------|----------------------|-----------|
| chat-streaming | 10 | 0% | N/A | N/A | 13488 | 21655 | ❌ FAIL |
| classifier-kafer | 10 | 0% | N/A | N/A | N/A | N/A | ❌ FAIL |
| json-wizard | 20 | 0% | 21438 | 11.5 | 18237 | 36280 | ❌ FAIL |
| rag-fiscal | 20 | 0% | 32793 | 11.4 | 31534 | 36300 | ❌ FAIL |

## Résumé global

- **Accuracy globale** : 0.0% (0/60)
- **Verdict** : ❌ FAIL — baisse de qualité détectée, NE PAS déployer

## Cas échoués

| ID | Catégorie | Score | Seuil | Erreur |
|----|-----------|-------|-------|--------|
| rag-001 | rag-fiscal | 0.23 | 0.75 |  |
| rag-002 | rag-fiscal | 0.14 | 0.75 |  |
| rag-003 | rag-fiscal | 0.00 | 0.75 |  |
| rag-004 | rag-fiscal | 0.00 | 0.75 |  |
| rag-005 | rag-fiscal | 0.00 | 0.75 |  |
| rag-006 | rag-fiscal | 0.00 | 0.75 |  |
| rag-007 | rag-fiscal | 0.00 | 0.75 |  |
| rag-008 | rag-fiscal | 0.00 | 0.75 |  |
| rag-009 | rag-fiscal | 0.00 | 0.75 |  |
| rag-010 | rag-fiscal | 0.00 | 0.75 |  |
| rag-011 | rag-fiscal | 0.00 | 0.75 |  |
| rag-012 | rag-fiscal | 0.25 | 0.75 |  |
| rag-013 | rag-fiscal | 0.00 | 0.75 |  |
| rag-014 | rag-fiscal | 0.00 | 0.75 |  |
| rag-015 | rag-fiscal | 0.00 | 0.75 |  |
| rag-016 | rag-fiscal | 0.00 | 0.75 |  |
| rag-017 | rag-fiscal | 0.00 | 0.75 |  |
| rag-018 | rag-fiscal | 0.00 | 0.75 |  |
| rag-019 | rag-fiscal | 0.00 | 0.75 |  |
| rag-020 | rag-fiscal | 0.40 | 0.75 |  |

## Seuils de performance

| Métrique | Valeur mesurée | Seuil | Status |
|----------|----------------|-------|--------|
| TTFT p50 | 30004 ms | ≤ 2000 ms | ⚠️ |
| tokens/s p50 | 11.4 | ≥ 20 | ⚠️ |
| Latence E2E p95 | 36277 ms | ≤ 30000 ms | ⚠️ |
