# Harness Benchmark Phase 2 Lexa IA

## Prérequis

```bash
pip install requests pynvml
```

`pynvml` est optionnel (mesure VRAM GPU). Si absent, les métriques VRAM seront ignorées.

## Structure

```
tasks/phase2-bench/
├── dataset/
│   ├── rag-fiscal.json        (20 cas RAG fiscal CH)
│   ├── json-wizard.json       (20 cas génération JSON wizard PP/PM)
│   ├── chat-streaming.json    (10 cas chat streaming CmdK)
│   └── classifier-kafer.json  (10 cas classification Käfer)
├── harness/
│   ├── run_benchmark.py       (harness Python)
│   └── README.md              (ce fichier)
└── reports/                   (créé automatiquement lors du run)
    ├── report_<model>_<date>.md
    └── results_<model>_<date>.json
```

## Usage

### 1. Dry-run (validation du dataset, SANS appels LLM)

```bash
cd tasks/phase2-bench/harness
python run_benchmark.py --model apolo13x/Qwen3.5-35B-A3B-NVFP4
```

Valide que tous les cas sont bien formés et affiche le plan d'exécution estimé.

### 2. Exécution réelle (nécessite --run)

```bash
# Benchmark complet (60 cas)
python run_benchmark.py \
  --model apolo13x/Qwen3.5-35B-A3B-NVFP4 \
  --endpoint http://192.168.110.103:8000 \
  --run

# Une seule catégorie (test rapide)
python run_benchmark.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --endpoint http://192.168.110.103:8000 \
  --categories classifier-kafer \
  --run

# Avec LLM-as-judge (utilise le modèle baseline pour évaluer)
python run_benchmark.py \
  --model nvidia/Llama-3.1-8B-NVFP4 \
  --endpoint http://192.168.110.103:8000 \
  --judge-model apolo13x/Qwen3.5-35B-A3B-NVFP4 \
  --judge-endpoint http://192.168.110.103:8000 \
  --run
```

### 3. Ordre recommandé pour les 7 modèles

Commencer par les petits modèles (charge DGX minimale, échecs rapides si qualité insuffisante):

```bash
# Étape 1 — Petits modèles (8B-9B)
python run_benchmark.py --model nvidia/Llama-3.1-8B-NVFP4 --endpoint http://DGX:8000 --run
python run_benchmark.py --model Qwen/Qwen2.5-7B-Instruct-NVFP4 --endpoint http://DGX:8000 --run  # 8B

# Étape 2 — Modèles moyens (27B-32B)
python run_benchmark.py --model Qwen/Qwen2.5-27B-Instruct-NVFP4 --endpoint http://DGX:8000 --run
python run_benchmark.py --model Qwen/Qwen2.5-32B-Instruct-NVFP4 --endpoint http://DGX:8000 --run

# Étape 3 — Modèles MoE candidats (35B-A3B)
python run_benchmark.py --model apolo13x/Qwen3.5-35B-A3B-NVFP4 --endpoint http://DGX:8000 --run  # baseline
python run_benchmark.py --model google/Gemma-4-26B-A4B-NVFP4 --endpoint http://DGX:8000 --run

# Étape 4 — Grand modèle (seulement si budget temps disponible)
python run_benchmark.py --model Qwen/Qwen2.5-122B-A10B-NVFP4 --endpoint http://DGX:8000 --run
```

## Métriques mesurées

| Métrique | Description | Seuil |
|----------|-------------|-------|
| TTFT p50 | Time-to-first-token médian (streaming) | ≤ 2 000 ms |
| tokens/s p50 | Débit de génération médian | ≥ 20 tok/s |
| Latence E2E p95 | Latence totale au 95ème percentile | ≤ 30 000 ms |
| VRAM peak | Pic d'utilisation mémoire GPU | informatif |
| Accuracy | % de cas passant les critères qualité | selon catégorie |

### Seuils qualité par catégorie

| Catégorie | Seuil accuracy |
|-----------|----------------|
| rag-fiscal | 75% |
| json-wizard | 90% |
| chat-streaming | 70% |
| classifier-kafer | 85% |

## Méthodes d'évaluation

### `contains` (string match)
Vérifie que la réponse contient les sous-chaînes attendues (insensible à la casse).
Score = nb_matches / total_expected.

### `regex` (pattern match)
Vérifie un pattern regex dans la réponse. Si le regex échoue, le score est réduit de 30%.

### `must_not_contain`
Vérifie l'absence de termes interdits (ex: utiliser compte 6500 au lieu de 6800 pour les frais bancaires).
Violation = score divisé par 2.

### `llm-as-judge` (optionnel)
Le modèle baseline `apolo13x/Qwen3.5-35B-A3B-NVFP4` évalue la qualité sur une échelle 0-10
en utilisant les `judge_criteria` de chaque cas. Activé avec `--judge-model`.

## Format du rapport de sortie

```markdown
# Rapport Benchmark Phase 2 — <model>
**Date** : ...

| Catégorie | N | Accuracy | TTFT p50 | tokens/s p50 | Latence E2E p50 | Latence E2E p95 | Pass/Fail |
...

## Résumé global
- Accuracy globale : XX%
- Verdict : ✅ PASS / ❌ FAIL
```

## Exit codes

- `0` : PASS — toutes les catégories au-dessus des seuils qualité
- `1` : FAIL — au moins une catégorie sous le seuil (ne pas déployer)
- `2` : Erreur de configuration (dataset manquant, etc.)

## Estimation des temps (DGX, baseline 35B-A3B)

Basé sur les observations Lexa (session 06-sessions):
- Génération baseline 35B-A3B : ~2-4 s/réponse pour max_tokens=200
- 60 cas × 3 s/cas = ~3 minutes par modèle
- Avec overhead (chargement modèle, LLM-judge x60) : ~8-15 minutes par modèle
- 7 modèles séquentiels : **~1h-2h total** (selon taille modèle)

Les modèles 8B-9B seront ~3x plus rapides que le 35B-A3B.
