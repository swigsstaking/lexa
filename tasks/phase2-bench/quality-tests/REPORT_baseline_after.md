# Rapport Qualité — Tests vLLM Migration Lexa

**Date** : 2026-04-22 06:30 UTC  
**Endpoint** : https://lexa.swigs.online  
**Runs par question** : 5  
**Total tests** : 20 agents + 0 edge cases = 20 cas  
**Accuracy globale agents** : 18/20 = **90.0%**  
**Accuracy edge cases** : 0/0 = **0.0%**  

---

## Tableau par agent

| Agent | Pass | Fail | Accuracy | Latence moy. (ms) | Cohérence (sim.) | Stables | Flag |
|-------|------|------|----------|-------------------|------------------|---------|------|
| tva | 9 | 1 | 90.0% | 6584.1 | 1.00 | 9/10 (90.0%) | OK |
| conseiller | 9 | 1 | 90.0% | 13952.9 | 0.20 | 9/10 (90.0%) | OK |

---

## Cohérence des réponses (5 runs)

Un test est **stable** si ≥70% des runs passent ET (similarité moyenne ≥ 0.55 OU écart-type du score < 0.15).

- **tva** : cohérence 1.00 (min 1.00), 9/10 cas stables (90.0%)
  - instables : `tva-004`
- **conseiller** : cohérence 0.20 (min 0.15), 9/10 cas stables (90.0%)
  - instables : `conseiller-003`


---

## Top Failures par agent

### tva

**tva-004** (standard)
- Q: `Quels sont les seuils d'éligibilité à la méthode TDFN en 2026?...`
- R: `Pour l'année 2026, les seuils d'éligibilité à la méthode des taux de la dette fiscale nette (TDFN) sont définis par l'art. 55 LTVA (RS 641.20) et préc...`
- Score contains: 33% | regex: N | must_not: OK

### conseiller

**conseiller-003** (standard)
- Q: `Quand une PME suisse devient-elle obligatoirement assujettie à la TVA?...`
- R: `**Constat**
Une PME suisse devient obligatoirement assujettie à la TVA lorsque son chiffre d'affaires annuel (biens et prestations) dépasse 105'000 CH...`
- Score contains: 40% | regex: Y | must_not: OK

---

## Top 10 Failures Critiques

| # | Agent | ID | Q (extrait) | Contains | Regex | Must-not |
|---|-------|----|-------------|----------|-------|----------|
| 1 | tva | tva-004 | `Quels sont les seuils d'éligibilité à la méthode TDFN en 202...` | 33% | N | OK |
| 2 | conseiller | conseiller-003 | `Quand une PME suisse devient-elle obligatoirement assujettie...` | 40% | Y | OK |
---

## Verdict final

****QUALITÉ PARTIELLE** — vLLM acceptable mais amélioration recommandée.**

- Accuracy globale agents : 90.0%
- Accuracy edge cases : 0.0%
- Aucun agent en dessous du seuil de 80%.

---
*Généré par run_quality.py — tests vLLM migration Lexa*