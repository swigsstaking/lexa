# Rapport Qualité — Tests vLLM Migration Lexa

**Date** : 2026-04-22 07:51 UTC  
**Endpoint** : https://lexa.swigs.online  
**Runs par question** : 3  
**Total tests** : 120 agents + 0 edge cases = 120 cas  
**Accuracy globale agents** : 117/120 = **97.5%**  
**Accuracy edge cases** : 0/0 = **0.0%**  

---

## Tableau par agent

| Agent | Pass | Fail | Accuracy | Latence moy. (ms) | Cohérence (sim.) | Stables | Flag |
|-------|------|------|----------|-------------------|------------------|---------|------|
| lexa | 9 | 1 | 90.0% | 7418.1 | 1.00 | 9/10 (90.0%) | OK |
| tva | 9 | 1 | 90.0% | 6547.5 | 1.00 | 9/10 (90.0%) | OK |
| cloture | 10 | 0 | 100.0% | 20395.9 | 1.00 | 10/10 (100.0%) | OK |
| conseiller | 10 | 0 | 100.0% | 13787.9 | 1.00 | 10/10 (100.0%) | OK |
| fiscal-pm | 10 | 0 | 100.0% | 18022.2 | 1.00 | 10/10 (100.0%) | OK |
| fiscal-pp-vs | 10 | 0 | 100.0% | 9718.6 | 1.00 | 10/10 (100.0%) | OK |
| fiscal-pp-ge | 10 | 0 | 100.0% | 10879.5 | 1.00 | 10/10 (100.0%) | OK |
| fiscal-pp-vd | 9 | 1 | 90.0% | 13294.3 | 1.00 | 9/10 (90.0%) | OK |
| fiscal-pp-fr | 10 | 0 | 100.0% | 12606.4 | 1.00 | 10/10 (100.0%) | OK |
| fiscal-pp-ne | 10 | 0 | 100.0% | 12571.5 | 1.00 | 10/10 (100.0%) | OK |
| fiscal-pp-ju | 10 | 0 | 100.0% | 11168.9 | 1.00 | 10/10 (100.0%) | OK |
| fiscal-pp-bj | 10 | 0 | 100.0% | 12507.6 | 1.00 | 10/10 (100.0%) | OK |

---

## Cohérence des réponses (3 runs)

Un test est **stable** si ≥70% des runs passent ET (similarité moyenne ≥ 0.55 OU écart-type du score < 0.15).

- **lexa** : cohérence 1.00 (min 1.00), 9/10 cas stables (90.0%)
  - instables : `lexa-008`
- **tva** : cohérence 1.00 (min 1.00), 9/10 cas stables (90.0%)
  - instables : `tva-004`
- **cloture** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **conseiller** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **fiscal-pm** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **fiscal-pp-vs** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **fiscal-pp-ge** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **fiscal-pp-vd** : cohérence 1.00 (min 1.00), 9/10 cas stables (90.0%)
  - instables : `fiscal-pp-vd-009`
- **fiscal-pp-fr** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **fiscal-pp-ne** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **fiscal-pp-ju** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)
- **fiscal-pp-bj** : cohérence 1.00 (min 1.00), 10/10 cas stables (100.0%)


---

## Top Failures par agent

### lexa

**lexa-008** (calcul)
- Q: `Un couple marié avec revenus de 120'000 CHF chacun: comment se calcule l'imposition commune IFD en 2...`
- R: `L'imposition commune pour les époux vivant en ménage commun est prévue par la jurisprudence et les circulaires, qui considèrent le mariage comme une u...`
- Score contains: 33% | regex: N | must_not: OK

### tva

**tva-004** (standard)
- Q: `Quels sont les seuils d'éligibilité à la méthode TDFN en 2026?...`
- R: `Pour l'année 2026, les seuils d'éligibilité à la méthode des taux de la dette fiscale nette (TDFN) sont définis par l'art. 55 LTVA (RS 641.20) et préc...`
- Score contains: 33% | regex: N | must_not: OK

### fiscal-pp-vd

**fiscal-pp-vd-009** (edge-case)
- Q: `Un contribuable vaudois né en 1850 peut-il encore bénéficier de déductions retraite en 2026?...`
- R: `Oui, un contribuable vaudois né en 1850 peut bénéficier de déductions retraite en 2026, à condition qu'il soit encore actif ou qu'il verse des cotisat...`
- Score contains: 100% | regex: N | must_not: OK

---

## Top 10 Failures Critiques

| # | Agent | ID | Q (extrait) | Contains | Regex | Must-not |
|---|-------|----|-------------|----------|-------|----------|
| 1 | lexa | lexa-008 | `Un couple marié avec revenus de 120'000 CHF chacun: comment ...` | 33% | N | OK |
| 2 | tva | tva-004 | `Quels sont les seuils d'éligibilité à la méthode TDFN en 202...` | 33% | N | OK |
| 3 | fiscal-pp-vd | fiscal-pp-vd-009 | `Un contribuable vaudois né en 1850 peut-il encore bénéficier...` | 100% | N | OK |
---

## Verdict final

****QUALITÉ PARTIELLE** — vLLM acceptable mais amélioration recommandée.**

- Accuracy globale agents : 97.5%
- Accuracy edge cases : 0.0%
- Aucun agent en dessous du seuil de 80%.

---
*Généré par run_quality.py — tests vLLM migration Lexa*