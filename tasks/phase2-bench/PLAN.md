# Phase 2 — Plan Benchmark Unification IA Lexa

**Date préparation** : 2026-04-21  
**Auteur** : Claude Sonnet 4.6  
**Statut** : Prêt pour review — benchmarks NON lancés

---

## Statistiques dataset

| Catégorie | Fichier | Cas | Sources réutilisées |
|-----------|---------|-----|---------------------|
| RAG fiscal CH | `rag-fiscal.json` | 20 | `qa-lexa.ts` (tva-1..3, pp-*-1, pp-pm-1), `FiscalPpNeAgent.ts`, `TvaAgent.ts`, `FiscalPmAgent.ts` |
| Génération JSON wizard | `json-wizard.json` | 20 | `taxpayers/schema.ts` (Step1..4Schema), `routes/companies.ts`, `seed-fixture-data.ts` (drafts PP VS + PM GE) |
| Chat streaming | `chat-streaming.json` | 10 | `e2e-pm-2026-04-20/rapport-e2e-pm.md` (données CmdK, anomalies ledger), `SYSTEM_PROMPT_CLASSIFIER` |
| Classification Käfer | `classifier-kafer.json` | 10 | `SYSTEM_PROMPT_CLASSIFIER` (15 exemples few-shot + règles R1-R6), `seed-fixture-data.ts` (TRANSACTIONS) |
| **Total** | | **60** | |

### Répartition des sous-catégories RAG

- TVA (LTVA/OLTVA): 5 cas
- Déductions PP par canton (VS/GE/VD/NE/JU/BJ/FR): 8 cas
- Barème IFD / valeur locative: 2 cas
- Fiscalité PM (IFD 8.5%, corrections art. 58): 3 cas
- Charges sociales (AVS/LPP): 2 cas

---

## Description du harness

**Fichier** : `harness/run_benchmark.py` (Python 3.10+, dépendances: `requests`, `pynvml` optionnel)

### Métriques collectées par cas

1. **TTFT** (Time-to-first-token) — streaming SSE, mesure jusqu'au premier chunk de contenu
2. **tokens/s** — débit de génération (tokens_generated / durée_génération)
3. **Latence E2E** — du premier octet de requête au dernier token
4. **VRAM avant/après** — via pynvml (GPU index 0), en MiB

### Méthodes d'évaluation accuracy

- `contains` : sous-chaînes obligatoires (insensible à la casse), score = fraction de matches
- `regex` : pattern regex, réduction ×0.7 si échec
- `must_not_contain` : termes interdits (ex: compte 6500 pour frais bancaires → règle R1), réduction ×0.5
- `json-wizard` : parsing JSON + validation champs clés (debit/credit_account prefix)
- `llm-as-judge` : score 0-10 par le modèle baseline sur `judge_criteria` (optionnel)

### Seuils qualité (PASS/FAIL par catégorie)

| Catégorie | Seuil accuracy | Justification |
|-----------|----------------|---------------|
| rag-fiscal | 75% | Tolérance pour variations de formulation juridique |
| json-wizard | 90% | JSON strict — erreur coûteuse pour le wizard PP/PM |
| chat-streaming | 70% | Conversations ouvertes, évaluation plus subjective |
| classifier-kafer | 85% | Règles R1-R6 critiques — erreur de compte = bug comptable |

### Seuils performance (basés sur baseline observée)

- TTFT p50 ≤ 2 000 ms (streaming perçu comme réactif par l'utilisateur)
- tokens/s p50 ≥ 20 (génération fluide streaming frontend)
- Latence E2E p95 ≤ 30 000 ms (timeout UX acceptable)

---

## Estimations de temps

Basé sur les observations sessions Lexa (agents Ollama/vLLM ~2-4 s/réponse, max_tokens=200-400):

| Modèle | Taille | Estimé/cas | 60 cas | Avec overhead |
|--------|--------|-----------|--------|---------------|
| Llama-3.1-8B NVFP4 | 8B | ~1-2 s | 2 min | ~5 min |
| Qwen2.5-7B/9B NVFP4 | 9B | ~1-2 s | 2 min | ~5 min |
| Qwen2.5-27B NVFP4 | 27B | ~3-4 s | 4 min | ~10 min |
| Qwen2.5-32B NVFP4 | 32B | ~3-5 s | 5 min | ~12 min |
| **Qwen3.5-35B-A3B NVFP4** | **35B MoE** | **~2-4 s** | **4 min** | **~10 min** |
| Gemma-4-26B-A4B NVFP4 | 26B MoE | ~2-4 s | 4 min | ~10 min |
| Qwen3.5-122B-A10B NVFP4 | 122B MoE | ~5-10 s | 8 min | ~20 min |

**Total 7 modèles** : ~70-80 minutes (DGX séquentiel, avec chargement modèle ~2 min/modèle)

---

## Ordre de benchmark recommandé

### Stratégie : petits d'abord (fail-fast)

```
1. Llama-3.1-8B NVFP4          ← baseline qualité minimale (8B)
2. Qwen2.5-9B NVFP4            ← meilleur petit candidat Qwen
3. Qwen2.5-27B NVFP4           ← seuil qualité moyen
4. Gemma-4-26B-A4B NVFP4       ← modèle MoE Google (concurrent)
5. Qwen2.5-32B NVFP4           ← proche taille baseline
6. apolo13x/Qwen3.5-35B-A3B    ← BASELINE DE RÉFÉRENCE (doit scorer ≥ seuils)
7. Qwen3.5-122B-A10B NVFP4     ← grand modèle (si temps disponible)
```

Arrêter si un modèle ≥ 8B atteint 90%+ accuracy globale ET TTFT < 1000 ms  
→ candidat optimal qualité/vitesse identifié.

---

## Critère de déploiement

Un modèle est **candidat au déploiement** si :
- Accuracy globale ≥ 80% (vs baseline ≥ 85% attendu)
- Aucune catégorie en dessous de son seuil individuel
- TTFT p50 ≤ TTFT_baseline (aucune régression perçue)
- tokens/s p50 ≥ tokens_baseline (vitesse égale ou meilleure)

Critère absolu utilisateur : **aucune baisse de qualité ET vitesse importante**.
