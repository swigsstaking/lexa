# Bench vision OCR — vLLM Qwen3-VL-8B-FP8 vs Ollama qwen3-vl-ocr

**Date** : 2026-04-22
**Host** : DGX Spark .103 (GB10, unified memory 128 GB)
**Dataset** : 20 documents synthétiques (10 certificats salaire + 5 attestations 3a + 5 factures) générés par `gen_dataset.py`.

---

## Résultats

| Backend | Accuracy | Latence avg | Latence p95 | VRAM alloué |
|---|---|---|---|---|
| **vLLM Qwen3-VL-8B-FP8** | **100 %** | **4.8 s** | **5.2 s** | ~25 % (~14 GB) |
| Ollama qwen3-vl-ocr | 100 % | 19.0 s | 28.8 s | dynamique (charge à la demande) |

**Verdict** : vLLM est **~4× plus rapide** que Ollama pour une précision identique à 100 % sur ce dataset synthétique.

### Par catégorie (vLLM)

| Cat | Accuracy | Latence avg |
|---|---|---|
| salary | 100 % | 5.6 s (cold 16.8s, warm ~5s) |
| 3a | 100 % | 2.6 s |
| invoice | 100 % | 4.3 s |

### Par catégorie (Ollama)

| Cat | Accuracy | Latence avg |
|---|---|---|
| salary | 100 % | 23.7 s |
| 3a | 100 % | 11.7 s |
| invoice | 100 % | 16.8 s |

---

## Setup vLLM

Container vLLM lancé sur `.103:8101` en parallèle du Qwen3.5-35B existant sur `:8100` :

```bash
docker run -d --name lexa-vllm-vl --gpus all --ipc=host -p 8101:8101 \
  -v /home/swigs/.cache/huggingface:/root/.cache/huggingface \
  -e MODEL=Qwen/Qwen3-VL-8B-Instruct-FP8 \
  -e PORT=8101 \
  -e GPU_MEMORY_UTIL=0.25 \
  -e MAX_NUM_SEQS=4 \
  -e MAX_MODEL_LEN=16384 \
  avarok/dgx-vllm-nvfp4-kernel:v22 serve
```

Image `avarok/dgx-vllm-nvfp4-kernel:v22` supporte à la fois NVFP4 et FP8 (générique). Le modèle `Qwen3-VL-8B-Instruct-FP8` était déjà en cache HF local.

---

## Gotcha identifié

**Conflit VRAM Ollama ↔ vLLM** : quand vLLM VL est up (0.25 util), Ollama `qwen3-vl-ocr` ne peut plus charger avec son KV-cache par défaut (262144 ctx = 24 GB KV-cache). Solution dans le bench : passer `num_ctx: 8192` dans `options` côté Ollama. À répliquer dans Lexa backend `OcrExtractor.ts` et `services/ocr/index.ts` si on garde Ollama en fallback.

---

## Recommandation

**Migrer le pipeline OCR Lexa vers vLLM Qwen3-VL-8B-FP8.**

Bénéfices concrets pour l'utilisateur :
- Upload certificat salaire haute-résolution : 60-120 s → **~6-8 s** (p95 stable)
- Le bug B2 OCR timeout (traité via `keep_alive: 30m` sur Ollama) devient un non-sujet : vLLM continuous batching + PagedAttention = pas de cold-start significatif entre 2 uploads.
- Moins de pression sur la VRAM partagée avec les autres agents.

Coût de la migration : faible — il suffit de rajouter une route client vLLM dans `apps/backend/src/services/ocr/index.ts` (analogue à `VllmClient.ts` pour le texte) qui utilise l'endpoint `/v1/chat/completions` avec `type: "image_url"` data: base64. L'API OpenAI-compat accepte déjà ce format.

## Prochaines étapes suggérées

1. Étendre le dataset à 50-100 docs **réels** (scans certificats 2024-2025) — le synthétique passe 100 % mais ne représente pas les scans avec artefacts/bruit.
2. Bencher aussi `Qwen3-VL-30B-A3B-NVFP4` (plus grand, encore plus précis) si VRAM le permet.
3. Implémenter la migration backend `OcrExtractor.ts` → `vllm.generateVision()`.
4. Conserver Ollama `qwen3-vl-ocr` en fallback si vLLM down, mais avec `num_ctx: 8192` forcé.
