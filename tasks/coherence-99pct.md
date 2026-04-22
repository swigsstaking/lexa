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

## Extension aux 12 autres agents — bench global

Patch propagé à `ConseillerAgent` (2 sites), `ClotureAgent`, `ClassifierAgent`, `AuditAgent`, `FiscalPmAgent` et les 7 `FiscalPp{Vs,Ge,Vd,Fr,Ne,Ju,Bj}` avec la même configuration greedy.

Bench `--agents all --repeat 3` (12 agents × 10 questions × 3 runs = 360 appels, 74 min) :

| Agent | Pass | Stables | Similarité |
|---|---|---|---|
| lexa | 9/10 | **10/10** | **1.00** |
| tva | 9/10 | **10/10** | **1.00** |
| cloture | **10/10** | **10/10** | **1.00** |
| conseiller | **10/10** | **10/10** | **1.00** |
| fiscal-pm | **10/10** | **10/10** | **1.00** |
| fiscal-pp-vs | **10/10** | **10/10** | **1.00** |
| fiscal-pp-ge | **10/10** | **10/10** | **1.00** |
| fiscal-pp-vd | 9/10 | **10/10** | **1.00** |
| fiscal-pp-fr | **10/10** | **10/10** | **1.00** |
| fiscal-pp-ne | **10/10** | **10/10** | **1.00** |
| fiscal-pp-ju | **10/10** | **10/10** | **1.00** |
| fiscal-pp-bj | **10/10** | **10/10** | **1.00** |
| **TOTAL** | **117/120 = 97.5 %** | **120/120 = 100 %** | **1.00 partout** |

**Objectif "99 % reproductible" → 100 % atteint.** Les 3 runs sont identiques bit-à-bit sur 100 % des cas.

### Analyse des 3 FAILS résiduels

1. `tva-004` : **faux négatif dataset**. Question = seuils TDFN 2026. Dataset attend `5 005 000`/`103 000` (2018-2023), modèle répond `5 024 000`/`108 000` (seuils ajustés 2024+ → corrects).
2. `lexa-008` : **faux négatif dataset**. Question = imposition commune IFD couple marié. Dataset attend mots exacts `LIFD` et `couple marié`, modèle utilise `IFD` (acronyme correct) et `époux vivant en ménage commun` (formulation légale correcte).
3. `fiscal-pp-vd-009` : **vrai FAIL raisonnement**. Edge-case « contribuable né en 1850 peut-il bénéficier de déductions retraite en 2026 ? ». Le modèle ne détecte pas l'anomalie (176 ans) et répond positivement. Réponse stable mais fausse.

Hors faux négatifs dataset, justesse réelle = 119/120 ≈ **99.2 %**.

## Reste à faire pour boucler à 99 %

1. **Corriger datasets** : `tva-004` (seuils 2026), `lexa-008` (souplesse sur mots attendus).
2. **Corriger `fiscal-pp-vd-009`** : soit améliorer le system prompt pour détecter les incohérences âge, soit accepter cet edge-case comme hors-scope (le modèle ne peut pas tout attraper).
3. **Bench edge-cases dédiés** (`run_quality.py --edge-only --repeat 5`) pour consolider.

## Fichiers livrés

- `apps/backend/src/llm/VllmClient.ts` (extension paramètres `topP`/`topK`/`repetitionPenalty`)
- `apps/backend/src/agents/**/{Lexa,Tva,Cloture,Classifier,Audit,Conseiller,FiscalPm,FiscalPp*}Agent.ts` (14 agents greedy vLLM)
- `tasks/phase2-bench/quality-tests/REPORT_baseline_before.md` / `REPORT_baseline_after.md` (bench tva + conseiller)
- `tasks/phase2-bench/quality-tests/REPORT_greedy_all.md` (bench global 12 agents, 120 cas)
- Commits : `ab215d9` (Lexa + Tva) puis suivant (12 agents restants)
