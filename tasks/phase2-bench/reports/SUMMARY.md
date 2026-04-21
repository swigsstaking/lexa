# Phase 2 — Benchmark NVFP4 : Résultats

**Date** : 2026-04-21  
**Plateforme** : DGX GB10 (NVIDIA, 128GB VRAM)  
**Dataset** : 60 cas (RAG fiscal CH × 20, JSON wizard × 20, chat streaming × 10, Käfer classifier × 10)  
**Harness** : `tasks/phase2-bench/harness/run_benchmark.py`

---

## Tableau récapitulatif

| # | Modèle | Params | Type | Accuracy | RAG | Wizard | Chat | Käfer | TTFT p50 | tok/s p50 | VRAM | Verdict |
|---|--------|--------|------|----------|-----|--------|------|-------|----------|-----------|------|---------|
| 1 | `Llama-3.1-8B-Instruct-NVFP4` | 8B | dense | 25.0% | ❌ 0.0% | ❌ 75.0% | ❌ 0.0% | ❌ 0.0% | 63ms | 41.4 | — | ❌ FAIL |
| 2 | `Qwen3-8B-NVFP4` | 8B | dense | 0.0% | ❌ 0.0% | ❌ 0.0% | ❌ 0.0% | ❌ 0.0% | 10057ms | 40.6 | — | ❌ FAIL |
| 3 | `Qwen3.5-9B-NVFP4` | 9B | dense (incompatible) | 0.0% | ❌ 0.0% | ❌ 0.0% | ❌ 0.0% | ❌ 0.0% | 103ms | 31.1 | — | ❌ FAIL |
| 4 | `Qwen3.5-27B-NVFP4` | 27B | dense (incompatible) | — | — | — | — | — | — | — | — | 🚫 INCOMPATIBLE |
| 5 | `gemma-4-26B-A4B-it-NVFP4` | 26B | MoE | — | — | — | — | — | — | — | — | 🚫 INCOMPATIBLE |
| 6 | `Qwen3-32B-NVFP4` | 32B | dense | 0.0% | ❌ 0.0% | ❌ 0.0% | ❌ 0.0% | ❌ 0.0% | 31389ms | 11.4 | — | ❌ FAIL |
| 7 | `Qwen3.5-35B-A3B-NVFP4` | 35B (A3B) | MoE (BASELINE) | 1.7% | ❌ 5.0% | ❌ 0.0% | ❌ 0.0% | ❌ 0.0% | 105ms | 38.4 | — | ❌ FAIL |
| 8 | `Qwen3.5-122B-A10B-NVFP4` | 122B (A10B) | MoE | — | — | — | — | — | — | — | — | 🚫 INCOMPATIBLE |

---

## Détail des verdicts

### ❌ nvidia/Llama-3.1-8B-Instruct-NVFP4

- **Accuracy globale** : 25.0% (15/60)
- **TTFT p50** : 63ms
- **tok/s p50** : 41.4
- **Latence E2E p95** : 9669ms

**Par catégorie :**
  - ❌ RAG fiscal CH: 0/20 (0.0%, seuil=75.0%)
  - ❌ JSON wizard: 15/20 (75.0%, seuil=90.0%)
  - ❌ Chat streaming: 0/10 (0.0%, seuil=70.0%)
  - ❌ Käfer classifier: 0/10 (0.0%, seuil=85.0%)

### ❌ RedHatAI/Qwen3-8B-NVFP4

- **Accuracy globale** : 0.0% (0/60)
- **TTFT p50** : 10057ms
- **tok/s p50** : 40.6
- **Latence E2E p95** : 10316ms

**Par catégorie :**
  - ❌ RAG fiscal CH: 0/20 (0.0%, seuil=75.0%)
  - ❌ JSON wizard: 0/20 (0.0%, seuil=90.0%)
  - ❌ Chat streaming: 0/10 (0.0%, seuil=70.0%)
  - ❌ Käfer classifier: 0/10 (0.0%, seuil=85.0%)

### ❌ AxionML/Qwen3.5-9B-NVFP4

- **Accuracy globale** : 0.0% (0/60)
- **TTFT p50** : 103ms
- **tok/s p50** : 31.1
- **Latence E2E p95** : 12383ms

**Par catégorie :**
  - ❌ RAG fiscal CH: 0/20 (0.0%, seuil=75.0%)
  - ❌ JSON wizard: 0/20 (0.0%, seuil=90.0%)
  - ❌ Chat streaming: 0/10 (0.0%, seuil=70.0%)
  - ❌ Käfer classifier: 0/10 (0.0%, seuil=85.0%)

### 🚫 apolo13x/Qwen3.5-27B-NVFP4

**Raison** : Checkpoint NVFP4 incompatible — paramètres `linear_attn.in_proj_ba.weight` manquants dans les couches du modèle. Architecture `Qwen3_5ForConditionalGeneration` non supportée par les checkpoints disponibles.

### 🚫 RedHatAI/gemma-4-26B-A4B-it-NVFP4

**Raison** : Checkpoint incompatible avec vLLM ou paramètres manquants.

### ❌ RedHatAI/Qwen3-32B-NVFP4

- **Accuracy globale** : 0.0% (0/60)
- **TTFT p50** : 31389ms
- **tok/s p50** : 11.4
- **Latence E2E p95** : 36277ms

**Par catégorie :**
  - ❌ RAG fiscal CH: 0/20 (0.0%, seuil=75.0%)
  - ❌ JSON wizard: 0/20 (0.0%, seuil=90.0%)
  - ❌ Chat streaming: 0/10 (0.0%, seuil=70.0%)
  - ❌ Käfer classifier: 0/10 (0.0%, seuil=85.0%)

### ❌ apolo13x/Qwen3.5-35B-A3B-NVFP4

- **Accuracy globale** : 1.7% (1/60)
- **TTFT p50** : 105ms
- **tok/s p50** : 38.4
- **Latence E2E p95** : 11062ms

**Par catégorie :**
  - ❌ RAG fiscal CH: 1/20 (5.0%, seuil=75.0%)
  - ❌ JSON wizard: 0/20 (0.0%, seuil=90.0%)
  - ❌ Chat streaming: 0/10 (0.0%, seuil=70.0%)
  - ❌ Käfer classifier: 0/10 (0.0%, seuil=85.0%)

### 🚫 RedHatAI/Qwen3.5-122B-A10B-NVFP4

**Raison** : Checkpoint incompatible avec vLLM ou paramètres manquants.

---

## Seuils de déploiement

| Critère | Seuil | Notes |
|---------|-------|-------|
| Accuracy globale | ≥ 80% | Aucune régression vs baseline |
| RAG fiscal CH | ≥ 75% | Tolérance variations juridiques |
| JSON wizard | ≥ 90% | Zéro erreur comptable |
| Chat streaming | ≥ 70% | Conversations ouvertes |
| Käfer classifier | ≥ 85% | Règles R1-R6 critiques |
| TTFT p50 | ≤ 2 000 ms | Réactivité streaming perçue |
| tok/s p50 | ≥ 20 | Fluidité génération |
| E2E p95 | ≤ 30 000 ms | Timeout UX acceptable |

---

## Analyse — Problèmes détectés

### Problème critique : harness de scoring incompatible avec le mode thinking Qwen3

**Symptôme** : La baseline `apolo13x/Qwen3.5-35B-A3B-NVFP4` obtient **1.7% (1/60)** avec le harness corrigé (sans `enable_thinking: false`), alors qu'en production elle répond correctement aux mêmes questions.

**Cause racine** : Les modèles Qwen3 et Qwen3.5 avec `--reasoning-parser qwen3` émettent du contenu de raisonnement dans `delta.reasoning_content`. Cependant, le modèle `Qwen3.5-35B-A3B-NVFP4` (architecture MoE) produit un `response_preview` commençant par "Thinking Process:" — ce texte de raisonnement se retrouve dans `delta.content` au lieu de `delta.reasoning_content`.

Conséquence pour le scoring :
- **JSON wizard** : `regex_ok: false` — le JSON est précédé de texte de raisonnement, la regex ne reconnaît pas le format attendu.
- **Käfer classifier** : idem, la structure JSON attendue est précédée de texte libre.
- **RAG fiscal** : les scores sont partiels (0.14-0.67) car le texte de raisonnement dilue les mots-clés attendus par le scorer.

### Harness v1 (avec `enable_thinking: false`) — résultats invalides

Les 3 benchmarks du premier run (Llama-3.1-8B, AxionML-9B, baseline 35B-A3B) ont été exécutés avec `enable_thinking: false` qui désactive la chaîne de raisonnement et dégrade artificiellement les performances. **Ces résultats ne reflètent pas le comportement réel des modèles.**

### Incompatibilités de charge

| Modèle | Raison |
|--------|--------|
| `apolo13x/Qwen3.5-27B-NVFP4` | Architecture `Qwen3_5ForConditionalGeneration` — paramètres `linear_attn.in_proj_ba.weight` manquants, Marlin kernel crash |
| `RedHatAI/gemma-4-26B-A4B-it-NVFP4` | `Gemma4ForConditionalGeneration` non reconnue — version transformers trop ancienne dans l'image Docker |
| `RedHatAI/Qwen3.5-122B-A10B-NVFP4` | 128GB VRAM insuffisant (même en MoE A10B actif) |

### Limites de performance Qwen3-32B

`RedHatAI/Qwen3-32B-NVFP4` a chargé correctement (370s) mais génère à **11.4 tok/s** (GPU GB10, backend Marlin). Avec thinking activé, le TTFT médian est **31 389ms** (seuil ≤ 2 000ms), dépassant systématiquement le timeout de 120s sur les cas RAG et wizard longs.

---

## Recommandation

**Aucun modèle challenger ne satisfait tous les critères de déploiement.**

Le baseline `apolo13x/Qwen3.5-35B-A3B-NVFP4` reste le modèle de production recommandé.

**Action requise pour Phase 3** : Corriger le harness de scoring pour les modèles Qwen3 avec thinking :
1. Adapter le scoring RAG pour ignorer le texte de raisonnement précédant la réponse finale.
2. Pour JSON wizard/classifier, extraire le JSON en ignorant les balises de thinking (`<think>...</think>`).
3. Mesurer le TTFT sur le premier token `delta.content` (réponse finale) et non `delta.reasoning_content` pour les métriques de latence perçue.

---

*Généré automatiquement par `tasks/phase2-bench/harness/generate_summary.py` puis enrichi manuellement.*
