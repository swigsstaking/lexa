# Sprint IA — Dataset Q&A fiscaux + LoRA + CPT

**Date scope** : 2026-04-22
**Objectif** : passer de « 99 % reproductible via greedy » (P0 actuel) à « 99 % juste sur les questions tordues » — l'objectif ultime du user.

---

## Pourquoi ce sprint

Aujourd'hui, les 14 agents Lexa tournent en **vanilla Qwen3.5-35B-A3B-NVFP4** + prompts système + RAG Qdrant. Tout le savoir fiscal vient du RAG, rien n'est dans les poids.

**Conséquences** :
- Excellente traçabilité (chaque réponse cite ses sources)
- Mais mauvaise intuition sur les cas tordus non couverts par le RAG (ex : `fiscal-pp-vd-009` — contribuable né en 1850)
- Le modèle raisonne en anglais/multilingue générique, pas en « fiscal suisse »
- Pas de sensibilité aux subtilités cantonales (LIPP GE ≠ LI VD ≠ LF VS)

**Gain attendu** avec LoRA fiscal + dataset de qualité :
- Style juridique suisse naturel
- Citations plus précises (bon article, bonne loi)
- Meilleure gestion des edge-cases
- Ratio ~99 % justes vs 97.5 % actuel

---

## Étapes (d'après la méthode du user)

### Étape 1 — Corpus (70 % déjà fait)

**État actuel** :
- ✅ Lois fédérales : LIFD, LHID, LTVA, CO, OIFD, OLTVA, OIA, ORC, LPP
- ✅ Lois cantonales : LF VS, LIPP GE, LI VD, LICD FR, LCN NE, LCJU, LCBJ (7 cantons)
- ✅ Barèmes PP/PM 2024-2026 pour 7 cantons
- ✅ Circulaires AFC (36 points Qdrant)
- ✅ Swissdec Guidelines
- ❌ **Jurisprudence ATF** (tribunal fédéral, ~500 arrêts fiscaux clés à récupérer depuis bger.ch)
- ❌ **Guides cantonaux officiels** (VD-Guide-PP, NE-Guide-PP, JU-Guide-PP non encore ingérés)

**À faire pour le sprint** :
- Scraper 500+ ATF fiscaux sur bger.ch filtré domaine fiscal
- Récupérer les guides PP/PM des 7 cantons (PDF à OCR-iser)
- Ingérer dans Qdrant collection `swiss_law` (embedder BGE-M3)

### Étape 2 — RAG (fait)

Pipeline RAG opérationnel :
- BGE-M3 embedder sur `.103:8082`
- Qdrant `swiss_law` 9761 points actuellement → cible ~12 000
- Re-ranking tier 0/1/2 par agent (LIFD art. 33 boosté pour conseiller, etc.)
- Top 5 chunks injectés dans le prompt

### Étape 3 — LoRA fine-tuning (à faire, 3-5 semaines)

**Cible** : adapter Qwen3-35B-A3B au style juridique fiscal suisse.

**Pas d'apprentissage de la loi** — ça reste dans le RAG. LoRA apprend :
1. Le style de raisonnement fiscal (structurer constat → article → calcul → disclaimer)
2. La terminologie (« personne physique domiciliée », « assujettissement illimité », etc.)
3. Le format des citations (Art. 33 al. 1 let. e LIFD, pas « Article 33 LIFD »)
4. Les nuances cantonales (VS ≠ GE sur le calcul coefficient communal)

**Techniques** :
- LoRA rank 16-32, alpha 32-64
- Target modules : q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj
- 1-3 epochs sur 1-5k exemples
- Learning rate 1e-4 avec warmup 3%

### Étape 4 — Dataset Q&A (LA clé — 4-6 semaines)

**Cible** : 1 500 - 3 000 exemples de haute qualité (qualité > quantité).

**Composition cible** :
- 500 questions PP (déclaration revenus/déductions/fortune, 7 cantons équilibrés)
- 500 questions PM (bénéfice, capital, amortissements, provisions)
- 300 questions TVA (méthodes, secteurs, taux, pro-rata)
- 200 questions comptables (CO 957-963, plan Käfer, clôture)
- 300 edge-cases (dates invalides, montants absurdes, doubles impositions, changements en cours d'année, frontaliers FR/IT/DE, successions)
- 200 cas pratiques complets (simulation complète d'un contribuable)

**Structure de chaque exemple** :
```json
{
  "id": "pp-vs-salary-001",
  "canton": "VS",
  "category": "pp_salarié",
  "question": "Un contribuable valaisan salarié gagne 95 000 CHF brut. ...",
  "context": { "year": 2026, "civilStatus": "single", "canton": "VS" },
  "reference_passages": ["LIFD art. 33 al. 1 let. e", "LF VS art. 28", "..."],
  "expected_answer": "Le plafond pilier 3a ...",
  "expected_citations": [{"law": "LIFD", "article": "33 al. 1 let. e"}, ...],
  "expected_calculations": { "plafond_3a": 7260, "economie_fiscale": 1542 },
  "difficulty": "basique|intermédiaire|expert|edge-case",
  "source": "generated_v1|corrected_v1|manual_v1"
}
```

**Méthode de création (pipeline des pros)** :
1. **Bootstrap automatique** : demander à Claude Opus/Sonnet 4.x de générer 3-5k exemples bruts à partir du corpus (Qdrant) + template de question
2. **Correction automatique** : demander à Claude de re-valider chaque exemple (citations correctes ? calculs justes ?) et filtrer les mauvais
3. **Revue humaine** : un expert fiscal passe sur les 300 edge-cases (critique)
4. **Annotation edge-cases** : marquer `difficulty: expert` pour les cas rares afin que LoRA les voie

### Étape 5 — Pipeline avancé (CPT optionnel, 2-3 semaines)

**Continued Pre-Training** sur le corpus fiscal brut (lois + ATF + guides + circulaires) pour « imbiber » le modèle du vocabulaire fiscal suisse avant LoRA.

**Quand le faire** :
- Si après LoRA sur 3000 exemples on est toujours en dessous de 99 %
- Si le style reste « générique » plutôt que « fiscal suisse »

**Sinon** : skip (LoRA suffit pour 95 % des cas).

---

## Timeline proposée

| Semaine | Chantier | Livrable |
|---|---|---|
| S1 | Ingestion ATF + guides cantonaux | `swiss_law` passe à 12 000 pts |
| S1-S2 | Bootstrap dataset automatique Claude | 3000 exemples bruts JSON |
| S2 | Correction auto Claude | 2500 exemples validés |
| S3 | Revue humaine edge-cases | 300 exemples experts |
| S3 | Infra fine-tuning (axolotl/unsloth sur Spark) | Scripts prêts |
| S4 | LoRA rank 32 training | Checkpoint LoRA v1 |
| S4 | Bench A/B LoRA vs vanilla | Rapport précision |
| S5 | Itération dataset + training | LoRA v2 |
| S6 | CPT si nécessaire | Checkpoint final |
| S6 | Déploiement production | Agents upgradés |

---

## Critères de succès

1. **Précision** : ≥ 99 % des questions bench `run_quality.py --repeat 5` réussies ET stables
2. **Edge-cases** : ≥ 95 % des 300 cas experts réussis (incluant détection d'incohérences style `pp-vd-009`)
3. **Latence** : inchangée ou meilleure (LoRA ne dégrade pas)
4. **VRAM** : checkpoint LoRA léger (< 1 GB adapter), rechargeable sans recharger le base model

---

## Risques

- **Sur-apprentissage sur les exemples** : si le dataset a des biais, LoRA amplifie. Solution : split train/val, revue diverse.
- **Hallucination augmentée** : LoRA peut rendre le modèle plus confiant même quand le RAG ne supporte pas. Solution : garde-fous de citations (rejeter si pas d'article cité).
- **Biais cantonal** : si 70 % des exemples sont VS, le modèle sur-performe VS. Solution : quota strict par canton.
- **Quality du bootstrap auto** : Claude peut lui-même se tromper sur les règles fiscales CH. Solution : review manuelle échantillonnage 10 %.

---

## Prochaines décisions utilisateur

- [ ] Budget temps : 6 semaines OK ou priorité à raccourcir ?
- [ ] Faire appel à un expert fiscal externe pour la revue edge-cases ? (sinon faire soi-même)
- [ ] Cible de cantons : 7 complets ou prioriser VS/GE/VD d'abord ?
- [ ] Infra training : utiliser DGX Spark directement ou louer temporairement un H100 ?
