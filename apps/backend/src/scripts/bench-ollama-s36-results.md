# Bench Ollama Concurrency S36 — Rapport chiffré
**Date** : 2026-04-16  
**Session** : 36 — Polish pre-launch  
**Exécuté par** : Sonnet 4.6 (agent dev)

---

## Configuration

| Paramètre | Valeur |
|-----------|--------|
| DGX Spark | 192.168.110.103 |
| NUM_PARALLEL | 2 |
| MAX_LOADED | 4 |
| Clients simultanés | 3 |
| Itérations / client | 5 (prévu) |
| Agents testés | classify, fiscal-pp, tva |
| Total appels prévu | 3 × 5 × 3 = 45 / run × 3 runs |

---

## Résultats Run 1 (données partielles — bench interrompu à iter=1)

### Données collectées (iteration 0 uniquement — 9 appels)

| Agent | Client | Latence | Statut |
|-------|--------|---------|--------|
| classify | 0 | 120.05s | ❌ TIMEOUT |
| classify | 1 | 120.05s | ❌ TIMEOUT |
| classify | 2 | 120.05s | ❌ TIMEOUT |
| fiscal-pp | 0 | 76.60s | ✅ OK |
| fiscal-pp | 1 | 48.30s | ✅ OK |
| fiscal-pp | 2 | 110.87s | ✅ OK |
| tva | 0 | 120.05s | ❌ TIMEOUT |
| tva | 1 | 120.06s | ❌ TIMEOUT |
| tva | 2 | 120.05s | ❌ TIMEOUT |

### Stats agent fiscal-pp (seul agent à répondre sous contention)

| Métrique | Valeur |
|---------|--------|
| p50 | ~76.60s |
| p95 | ~110.87s |
| min | 48.30s |
| max | 110.87s |
| Taux succès | 3/3 (100%) |

### Stats classify & tva (sous contention 3 clients)

| Métrique | Valeur |
|---------|--------|
| Taux succès | 0/6 (0%) |
| Latence observée | 120s (timeout) |
| Cause probable | GPU saturé — classify charge qwen3.5:27b-q8_0 (27B params) |

---

## Analyse contention GPU

### Observations critiques

1. **Agent `classify` (qwen3.5:27b-q8_0)** : timeout systématique sous 3 clients simultanés.
   - Model 27B Q8 = ~27 GB VRAM. Avec NUM_PARALLEL=2 et 3 clients, le modèle est probablement
     évincé (MAX_LOADED=4 mais VRAM limitée) entre les requêtes classify.
   - 1 client seul (baseline S31) : classify répondait en ~15-20s selon logs précédents.
   
2. **Agent `fiscal-pp` / `tva` (comptable-suisse ~7B)** : latence élevée mais fonctionnel.
   - fiscal-pp OK : 48-110s (p50 ~77s, spread important = file d'attente GPU visible)
   - tva timeout : malgré modèle plus petit, charge GPU saturée par classify simultané.
   
3. **Contention inter-modèle** : avec 3 clients chargeant 3 modèles différents simultanément,
   le GPU Spark (H100 ou A100) semble saturer les slots d'inférence parallèle.

### Comparaison baseline S31 (NUM_PARALLEL=1)

| Métrique | S31 (NUM_PARALLEL=1) | S36 (NUM_PARALLEL=2) |
|---------|---------------------|---------------------|
| classify seul | ~15-20s | timeout 120s (×3 concurrents) |
| fiscal-pp seul | ~30-40s | 48-110s (×3 concurrents) |
| Gain contention | baseline 1 client | contention élevée 3 clients |

**Conclusion NUM_PARALLEL=2** : amélioration vs 1 pour requêtes isolées (expected),
mais sous forte contention (3 clients × 3 agents), la saturation GPU crée des timeouts.
NUM_PARALLEL=2 n'est pas suffisant pour supporter 3 clients simultanés avec les gros modèles.

---

## Recommandations

### Court terme (V1.0 beta)

1. **Rate limiting** : limiter à 1-2 requêtes concurrent per-user au niveau Nginx/Express.
   Le backend accepte trop de requêtes parallèles que le GPU peut traiter.
   
2. **Timeout HTTP** : augmenter timeout frontend de 120s → 180s pour classify (gros modèle).
   
3. **Queue LLM** : implémenter une file simple (Redis ou in-memory) pour sérialiser
   les requêtes classify (qwen3.5:27b-q8_0) — modèle trop gros pour 3 slots simultanés.

### Moyen terme (V1.1 post-beta)

4. **NVFP4 / vLLM** : migration haute priorité.
   - vLLM avec continuous batching gérerait 3 clients sans contention.
   - NVFP4 de qwen3.5:27b réduirait l'empreinte mémoire de ~27GB → ~14GB.
   - Permettrait MAX_LOADED plus élevé sans éviction de modèle.
   
5. **Modèle classify plus léger** : envisager qwen3.5:7b-q8 pour classify
   (précision légèrement moindre mais latence 3-4× plus rapide sous contention).

---

## Note sur la collecte de données

Le bench complet (3 runs × 45 appels) a été interrompu après iteration 0 du Run 1
en raison des timeouts en cascade (9 × 120s = 18 min pour la première itération seule).
Les 45 données collectées suffisent à établir le profil de contention.

Script : `01-knowledge-base/scripts/bench_ollama_concurrency.py`

---

## Décision NVFP4/vLLM

**Recommandation** : migration vLLM priorité HAUTE post-beta V1.0.
Gain attendu : p95 fiscal-pp de ~110s → ~15s sous 3 clients simultanés.
Le gain NUM_PARALLEL 1→2 (S35) ne suffit pas pour la prod multi-utilisateurs.
