# Prompt de bootstrap — instance Claude Code dédiée « Sprint IA Lexa »

**À copier-coller intégralement** dans une nouvelle instance Claude Code (même repo, branch dédiée `sprint-ia/v1`).

---

## CONTEXTE — lis d'abord ces fichiers dans l'ordre

1. `README.md` racine — vue d'ensemble Lexa (plateforme fiscale-comptable suisse IA locale)
2. `tasks/sprint-ia-roadmap.md` — **scope complet de ta mission**, décisions validées, protocole bench, plan rollback
3. `HANDOFF-2026-04-22.md` — état du projet au démarrage du sprint
4. `~/.claude/CLAUDE.md` — instructions globales (langue **FR obligatoire**, plan mode par défaut, subagents, etc.)
5. `~/.claude/projects/-Users-corentinflaction-CascadeProjects-lexa/memory/MEMORY.md` — gotchas critiques (rsync .env, ledger_entries matview, vLLM healthcheck, DB destructive confirmation, validation Chrome MCP pour UI, commit autonomy)
6. `02-architecture/agent-system.md` — écosystème des 14 agents Lexa actuels

Ensuite :
7. `tasks/phase2-bench/quality-tests/run_quality.py` — harness de bench actuel (120 questions sur 12 agents, greedy, sim=1.00 sur 100 % des cas)
8. `apps/backend/src/agents/lexa/LexaAgent.ts` + `apps/backend/src/llm/VllmClient.ts` + `apps/backend/src/llm/agent-prompts.ts` — comment les agents actuels sont câblés
9. Le dernier commit bench : `git log --oneline --all | head -20` pour le contexte récent

---

## TA MISSION — en une ligne

**Entraîner Lexa pour en faire un expert fiscal suisse au niveau « 99 % juste sur toutes les questions, y compris les edge-cases », via dataset Q&A curé + LoRA (+ CPT optionnel), sur les 7 cantons simultanément (VS, GE, VD, FR, NE, JU, BJ).**

Le produit actuel est à 97.5 % de précision / 100 % reproductibilité via greedy. Tu dois monter à 99 %+ sur la précision ET rendre le modèle natif du fiscal suisse (terminologie, style juridique, raisonnement, détection d'incohérences).

---

## DÉCISIONS DÉJÀ VALIDÉES PAR LE USER — tu n'as PAS à les remettre en cause

| Décision | Valeur |
|---|---|
| Budget temps | **6 semaines** |
| Expert fiscal externe humain | **Non** — l'IA est seule experte (bootstrap auto Claude + revue auto Claude + petite revue humaine user 10 % échantillon) |
| Cantons | **Les 7 en même temps** : VS, GE, VD, FR, NE, JU, BJ — quota strict ≥ 15 % par canton dans le dataset |
| Infra training | **DGX Spark directement**, blocage du service 4-8h accepté — MAIS sauvegarde intégrale de la config OBLIGATOIRE avant |
| Actualité données | Toutes les lois / barèmes / circulaires / Info TVA / guides cantonaux **à jour de la date de training** (2026) |
| Pilier produit | La qualité fiscale suisse est le pilier de Lexa — **zero compromis** même si training prend des semaines supplémentaires |

**Règle absolue** : si à un moment tu hésites sur une décision qui impacte la qualité fiscale, tu choisis systématiquement l'option qui maximise la qualité, pas celle qui raccourcit le sprint.

---

## PHASES OBLIGATOIRES — dans l'ordre

### Phase 0 — Sauvegarde pre-sprint (jour 0, OBLIGATOIRE AVANT TOUT)

Tu ne démarres pas le sprint sans ces 5 items exécutés et vérifiés :

1. `docker commit lexa-vllm-classifier lexa-vllm-classifier:backup-YYYYMMDD`
2. `docker commit lexa-vllm-vl lexa-vllm-vl:backup-YYYYMMDD`
3. Qdrant snapshot : `curl -X POST http://192.168.110.103:6333/collections/swiss_law/snapshots` + `scp` dans `/backup/`
4. `tar czf /backup/hf-cache-YYYYMMDD.tar.gz /home/swigs/.cache/huggingface/`
5. `git tag v1.0-pre-lora` sur le commit actuel, puis créer branch `sprint-ia/v1` et y travailler

Puis écris `tasks/sprint-ia/rollback.sh` qui restore tout en < 10 min.

**Sans ces 5 items validés, tu ne lances aucun training, aucune modif Qdrant, aucune modif prod.**

### Phase 1 — Corpus enrichi (semaine 1)

État actuel Qdrant `swiss_law` : 9 761 points (LIFD, LHID, LTVA, CO, OIFD, OLTVA, OIA, ORC, LPP, barèmes PP/PM 7 cantons, Swissdec, AFC Circulaires).

**Manque identifié** :
- Jurisprudence ATF (~500 arrêts fiscaux clés) depuis bger.ch
- Guides PP/PM officiels des 7 cantons en PDF (VS-Guide-PP, GE-Guide-PP, etc. — certains déjà dans Qdrant, vérifie)
- Info TVA AFC (12, 15, sector 17, sector 04) en version 2025/2026 si mise à jour
- Circulaires AFC IFD récentes (2024-2026)

Livrable : Qdrant `swiss_law` passe de 9 761 → ~12 000 points, avec ingestion scriptée reproductible dans `tasks/sprint-ia/ingest/`.

### Phase 2 — Dataset Q&A (semaines 1-3)

**Cible : 1 500 à 3 000 exemples de très haute qualité.** Qualité >> quantité. 500 bons exemples battent 10 000 moyens.

**Composition stricte** :

| Sous-ensemble | Nombre | Description |
|---|---|---|
| PP de base (7 cantons équilibrés) | 500 | Revenus, déductions, fortune, barèmes, plafonds 2026 |
| PM (SA, Sàrl, Association, Coop) | 500 | Bénéfice, capital, amortissements, provisions, IFD art. 58 |
| TVA (LTVA/OLTVA) | 300 | Méthodes effective/TDFN, secteurs, taux, pro-rata, option Art. 22 |
| Comptabilité CO | 200 | Articles 957-963, plan Käfer, clôture continue |
| Edge-cases (raisonnement) | 300 | Dates/montants incohérents, frontaliers FR/IT/DE, successions, changements en cours d'année |
| Cas pratiques complets | 200 | Simulation bout-en-bout d'un contribuable PP + société |

**Quota cantonal** : chaque canton (VS, GE, VD, FR, NE, JU, BJ) a ≥ 15 % du sous-total PP (minimum 75 exemples par canton).

**Structure JSON obligatoire** pour chaque exemple :

```json
{
  "id": "pp-ge-salary-001",
  "canton": "GE",
  "category": "pp_salarié",
  "question": "Un contribuable genevois salarié à Genève gagne 95 000 CHF brut annuel...",
  "context": { "year": 2026, "civilStatus": "single", "canton": "GE", "commune": "Genève" },
  "reference_passages_in_rag": ["LIFD art. 33 al. 1 let. e", "LIPP art. 31", "..."],
  "expected_answer": "Le plafond pilier 3a 2026 pour un salarié affilié LPP est de CHF 7 260...",
  "expected_citations": [
    { "law": "LIFD", "article": "33 al. 1 let. e", "rs": "642.11" },
    { "law": "LIPP", "article": "31", "rs": "RSG D 3 08" }
  ],
  "expected_calculations": { "plafond_3a": 7260, "economie_fiscale_ge": 1542 },
  "difficulty": "basique|intermédiaire|expert|edge-case",
  "source": "generated_v1|corrected_v1|manual_v1"
}
```

**Méthode de création — pipeline des pros, obligatoire** :

1. **Bootstrap automatique** — génère ~5 000 exemples bruts via Claude Opus (cette instance ou API `claude-opus-4-7`) en feedant :
   - Un template de question (fiche de raisonnement par catégorie)
   - Les chunks Qdrant pertinents comme RAG context
   - Instructions de format JSON strict
2. **Correction automatique** — chaque exemple bruté est re-validé par Claude :
   - Les `expected_citations` citent-elles des articles qui EXISTENT dans Qdrant `swiss_law` ? (cross-check programmatique)
   - Les `expected_calculations` sont-ils numériquement cohérents (pas d'hallucination CHF) ?
   - Le `canton` correspond-il à l'article cité (pas de LIPP GE sur une question VS) ?
   - Filtre : si ≥ 1 KO → rejet ou mise en file manuelle
3. **Dédup** — similarité cosinus > 0.92 → merge
4. **Revue user 10 %** — échantillon aléatoire, le user valide à la main
5. **Split train/val** — 90 / 10 stratifié par canton + catégorie

**Livrable Phase 2** : `tasks/sprint-ia/dataset/train.jsonl` + `val.jsonl` + `dataset-stats.md` (distribution canton × catégorie × difficulté).

### Phase 3 — Bench baseline (avant training)

Avant de toucher aux poids :

1. Étendre le bench `run_quality.py` avec **200 nouvelles questions** test (distinctes du dataset de training) couvrant :
   - 40 « intelligence pure » (raisonnement multi-étapes sans réponse directe dans RAG)
   - 40 edge-cases
   - 40 qualité citations (article exact)
   - 40 calculs précis (CHF au cent près)
   - 40 actualité 2026
2. Exécuter le bench 5× sur la **config A baseline** (Qwen3.5-35B vanilla + RAG + greedy actuel) pour établir la ligne de base
3. Mesurer les **9 métriques** définies dans `tasks/sprint-ia-roadmap.md` section « Protocole bench » :
   précision factuelle, stabilité, qualité citations, précision calculs, détection edge-cases, actualité, **TTFT, latence e2e, throughput tokens/s**

**Livrable Phase 3** : `tasks/sprint-ia/bench/baseline-A.md` avec les 9 métriques chiffrées.

### Phase 4 — LoRA v1 (semaine 4)

**Hyperparamètres par défaut (à ajuster si besoin)** :
- Framework : `unsloth` ou `axolotl` sur DGX Spark (adapter le choix au support Blackwell GB10)
- Base : `apolo13x/Qwen3.5-35B-A3B-NVFP4` (attention : fine-tune sur quantifié = QLoRA ; si problème, passer à la BF16 temporaire)
- LoRA rank 32, alpha 64, dropout 0.05
- Target modules : `q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj`
- 2 epochs, learning rate 1e-4, warmup 3 %, cosine schedule
- Batch size effective 8 (grad accumulation adaptée à VRAM)
- Loss : cross-entropy standard, pas de DPO cette fois

**Livrable Phase 4** :
- Checkpoint LoRA v1 (< 1 GB, adapter séparé du base)
- Plugin vLLM pour charger l'adapter à la volée (pas de merge)
- `tasks/sprint-ia/train/lora-v1-config.yaml` reproducible

### Phase 5 — Bench post-LoRA (A vs B)

Répéter Phase 3 avec l'adapter chargé. Objectif chiffré **config B vs config A** :

| Métrique | Cible B (LoRA v1) |
|---|---|
| Précision factuelle | ≥ 99 % (vs 97.5 % A) |
| Stabilité | 100 % maintenu |
| Qualité citations | +15 points vs A |
| Précision calculs | +10 points |
| Détection edge-cases | ≥ 85 % (vs ~60 % A) |
| Actualité 2026 | ≥ 95 % (vs ~80 % A) |
| TTFT | ≤ 2.0 s (overhead ≤ 30 %) |
| Latence e2e | inchangée ou meilleure |
| Throughput | ≥ 20 t/s (vs 25 t/s A) |

Si les cibles B ne sont **pas atteintes** → itérer dataset + re-train (quota +300 exemples dans les catégories faibles).

### Phase 6 — CPT optionnel (semaine 5)

**Ne déclenche CPT que si après 2 itérations LoRA on plafonne sous 99 %.**

CPT = continued pre-training sur le corpus fiscal brut (lois + ATF + guides + circulaires, ~200 MB texte) pendant 1 epoch, lr 5e-5. Puis re-LoRA par-dessus.

### Phase 7 — Déploiement prod (semaine 6)

**Rollout progressif** :

1. Shadow deploy : servir l'adapter sur un 3e container vLLM port 8103 en parallèle du 8100 actuel, **sans le router en prod**
2. A/B test : router 10 % du trafic vers l'adapter pendant 24 h, comparer métriques live
3. Si métriques OK : bascule 100 %
4. Surveillance 7 jours avec métriques continues
5. Si régression détectée → rollback automatique via le script Phase 0

---

## CE QUE TU NE FAIS PAS

- **Tu ne modifies JAMAIS la prod Lexa `.59`** sans la validation user explicite
- **Tu ne touches pas aux 14 agents actuels** (routes/agents.ts, agent-prompts.ts) — ils tournent en prod stable
- **Tu ne commits JAMAIS directement sur `main`** — toujours sur la branch `sprint-ia/v1`
- **Tu n'oublies JAMAIS la revue programmatique des citations** (cross-check Qdrant) avant d'ajouter un exemple au dataset
- **Tu ne lances JAMAIS un training sans Phase 0 complète**
- **Tu n'acceptes JAMAIS un exemple sans ses champs `reference_passages_in_rag`, `expected_citations` et `canton` remplis**

---

## RÈGLES DE COLLABORATION

- **Langue** : toutes tes réponses, commits, docs en **français**. Code et noms de variables en anglais.
- **Plan mode** : systématique pour toute tâche ≥ 3 étapes
- **Commits autorisés** sans demander : après `tsc --noEmit` + bench rapide OK, tu commit directement sur `sprint-ia/v1`. Mais **tu ne push jamais** sans demander le user
- **Opérations destructives** (DELETE DB, rm -rf, force push, drop collection Qdrant) : confirmation user obligatoire
- **Subagents** : utilise-les pour paralléliser (ex : bootstrap dataset × 7 cantons en parallèle, un subagent par canton)
- **Compute** : n'hésite pas à utiliser Claude Opus/Sonnet en API pour générer + corriger le dataset. Budget estimé ~$200-500 pour les 3 000 exemples.
- **Statuts** : après chaque phase, tu publies un rapport markdown `tasks/sprint-ia/reports/phase-N.md` et tu demandes au user de valider avant de passer à la phase suivante.

---

## INFRA — ce qui est déjà en place

- **Backend** : `swigs@192.168.110.59`, pm2 `lexa-backend`, port 3010, prod stable depuis 24 h (fine-tuning side-effects → attention)
- **vLLM classifier** (texte, 35B) : `.103:8100`, container `lexa-vllm-classifier` (image `avarok/dgx-vllm-nvfp4-kernel:v22`), sert `apolo13x/Qwen3.5-35B-A3B-NVFP4`
- **vLLM vision** (8B FP8) : `.103:8101`, container `lexa-vllm-vl`, restart=unless-stopped, sert `Qwen/Qwen3-VL-8B-Instruct-FP8`
- **Ollama** : `.103:11434`, fallback (`qwen3-vl-ocr` modelfile custom)
- **Qdrant** : `.103:6333`, collection `swiss_law` (9 761 pts, BGE-M3 1024 dim)
- **Embedder** : `.103:8082` BGE-M3
- **Postgres** : `127.0.0.1:5432/lexa` depuis `.59`, RLS obligatoire (`queryAsTenant`)

**VRAM GB10 (128 GB unified)** :
- classifier 35B : 45 % (~58 GB)
- vl 8B FP8 : 25 % (~32 GB)
- **reste pour training : ~30 % (~38 GB)** — assez pour QLoRA sur 35B

---

## CRITÈRE D'ACCEPTATION FINAL (ce que le user va valider à S6)

Le sprint est un succès SI ET SEULEMENT SI **TOUTES** les conditions suivantes sont remplies :

- [ ] Bench config B (LoRA v1) ≥ 99 % précision factuelle sur 320 questions (120 actuelles + 200 nouvelles), 100 % reproductibilité (sim=1.00)
- [ ] Toutes les 9 métriques atteintes ou dépassées
- [ ] Tous les 7 cantons testés avec équilibre (aucun canton < 90 % précision)
- [ ] Rollback scripté et testé (restore < 10 min)
- [ ] Documentation complète : `dataset-stats.md`, `lora-v1-config.yaml`, `rollback.sh`, rapport final `sprint-ia/reports/final.md`
- [ ] Validation user sur 20 questions choisies au hasard (user juge lui-même la qualité)

**Si un seul critère manque, le sprint n'est pas considéré terminé — itère.**

---

## PREMIER MESSAGE À M'ENVOYER (quand tu démarres)

« Je démarre le sprint IA Lexa. Phase 0 en cours : voici le plan de sauvegarde détaillé que je propose d'exécuter en premier. [liste des 5 commandes avec timings estimés]. Tu valides ? »

Puis attends ma validation. Ensuite enchaîne.
