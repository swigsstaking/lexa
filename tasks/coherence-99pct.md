# Cohérence IA 99 % — P0 chantier 2026-04-22

## Problème

Le bench `--repeat 3` du 2026-04-22 (10 questions × TVA) montrait 4/10 questions instables : deux runs consécutifs donnaient trois reformulations très différentes alors que le fond était identique. Objectif utilisateur : **99 % de réponses justes ET reproductibles**.

## Cause racine

vLLM Qwen3.5-35B-A3B-NVFP4 tournait avec `temperature=0.2`, `top_p`/`top_k` par défaut serveur. La stochasticité résiduelle suffisait à reformuler la prose entre runs, sans changer le fond.

## Patch baseline — greedy déterministe

`apps/backend/src/llm/VllmClient.ts` : ajout des paramètres `topP`, `topK`, `repetitionPenalty` (passés directement dans le body vLLM `/v1/chat/completions`, vLLM accepte ces extensions non-OpenAI).

`apps/backend/src/agents/lexa/LexaAgent.ts` + `apps/backend/src/agents/tva/TvaAgent.ts` : les appels vLLM (sync + streaming) utilisent désormais :

```ts
{ temperature: 0, topP: 0.1, topK: 1, repetitionPenalty: 1.0 }
```

Les fallbacks Ollama sont laissés inchangés (cas de panne vLLM rare ; on accepte une légère perte de reproductibilité dans ce mode dégradé).

## Mesure — bench `tva conseiller --repeat 5`

**Avant** (`REPORT_baseline_before.md`) :

| Agent | Pass | Stables | Similarité |
|---|---|---|---|
| tva | 8/10 (80 %) | 5/10 (50 %) | 0.36–0.86 |
| conseiller *(non patché)* | 9/10 (90 %) | 9/10 (90 %) | 0.13–0.32 |

**Après** (`REPORT_baseline_after.md`) :

| Agent | Pass | Stables | Similarité |
|---|---|---|---|
| tva | 9/10 (90 %) | **10/10 (100 %)** | **1.00** partout |
| conseiller *(non patché)* | 9/10 (90 %) | 9/10 (90 %) | 0.13–0.32 (inchangé) |

Lecture :
- Sur TVA (patché) : les 5 runs sont **identiques bit-à-bit** (sim=1.00). Les 3 cas précédemment instables (`tva-003/007/008`) sont maintenant stables, et `tva-009` passe de FAIL 2/5 à PASS 5/5.
- Sur Conseiller (non patché, contrôle) : similarité inchangée → confirme que le gain vient bien du greedy.
- **Latence inchangée** (~6.5s TVA, ~14s Conseiller).

## Cas résiduel `tva-004`

FAIL persistant (0/5) mais **stable** (sim=1.00). Inspection :
- Question : seuils TDFN 2026
- Dataset attend : `5 005 000` et `103 000` (seuils 2018-2023)
- Modèle répond : `5 024 000` et `108 000` (seuils adaptés à l'indexation, **corrects pour 2026**)

→ **faux négatif** : le dataset `tva.json` est obsolète, le modèle est juste. À corriger côté dataset (pas côté modèle).

## Décision — self-consistency vs two-stage

La piste 1 du handoff (greedy) **suffit à elle seule** pour atteindre la cohérence. Les pistes 2–5 deviennent caduques pour ce besoin précis :

- **Self-consistency N=3** : inutile, les 3 runs greedy sont identiques → pas de vote à faire.
- **Two-stage retrieve → format** : sur-ingénierie, la reproductibilité est déjà à 100 % sans.
- **Cache déterministe** : utile pour la latence FAQ (réponse instantanée), orthogonal à la cohérence.
- **Structured output JSON** : utile uniquement si on veut extraire des chiffres dans un schéma strict côté API consommateur.

## Reste à faire pour atteindre 99 %

1. **Étendre le greedy aux 12 autres agents** (même 4 lignes dans chaque `ask()`) :
   - `ConseillerAgent`, `ClotureAgent`, `FiscalPmAgent`, `ClassifierAgent`, `AuditAgent`
   - 7 agents `FiscalPp{Vs,Ge,Vd,Fr,Ne,Ju,Bj}`
2. **Corriger les datasets obsolètes** (ex `tva-004` : seuils 2026).
3. **Relancer un bench global** `--agents all --repeat 5` pour valider la cohérence sur 120+ questions.
4. **Évaluer le contenu** : sur les questions qui PASSENT stablement mais pourraient être meilleures, considérer des améliorations RAG (re-ranking, chunks plus précis) — c'est hors scope cohérence.

## Fichiers livrés

- `apps/backend/src/llm/VllmClient.ts` (extension paramètres)
- `apps/backend/src/agents/lexa/LexaAgent.ts` (greedy vLLM)
- `apps/backend/src/agents/tva/TvaAgent.ts` (greedy vLLM)
- `tasks/phase2-bench/quality-tests/REPORT_baseline_before.md` / `results_baseline_before.json`
- `tasks/phase2-bench/quality-tests/REPORT_baseline_after.md` / `results_baseline_after.json`
