# Rapport Qualité — Tests vLLM Migration Lexa

**Date** : 2026-04-22 06:12 UTC  
**Endpoint** : https://lexa.swigs.online  
**Runs par question** : 5  
**Total tests** : 20 agents + 0 edge cases = 20 cas  
**Accuracy globale agents** : 17/20 = **85.0%**  
**Accuracy edge cases** : 0/0 = **0.0%**  

---

## Tableau par agent

| Agent | Pass | Fail | Accuracy | Latence moy. (ms) | Cohérence (sim.) | Stables | Flag |
|-------|------|------|----------|-------------------|------------------|---------|------|
| tva | 8 | 2 | 80.0% | 7168.3 | 0.46 | 5/10 (50.0%) | OK |
| conseiller | 9 | 1 | 90.0% | 14541.4 | 0.23 | 9/10 (90.0%) | OK |

---

## Cohérence des réponses (5 runs)

Un test est **stable** si ≥70% des runs passent ET (similarité moyenne ≥ 0.55 OU écart-type du score < 0.15).

- **tva** : cohérence 0.46 (min 0.36), 5/10 cas stables (50.0%)
  - instables : `tva-003, tva-004, tva-007, tva-008, tva-009`
- **conseiller** : cohérence 0.23 (min 0.13), 9/10 cas stables (90.0%)
  - instables : `conseiller-003`


---

## Top Failures par agent

### tva

**tva-004** (standard)
- Q: `Quels sont les seuils d'éligibilité à la méthode TDFN en 2026?...`
- R: `Pour l'année 2026, les seuils d'éligibilité à la méthode des Taux de la Dette Fiscale Nette (TDFN) sont fixés par l'Info TVA 12 (section 55). Un assuj...`
- Score contains: 33% | regex: N | must_not: OK

**tva-009** (edge-case)
- Q: `Quel sera le taux TVA standard en Suisse en 2099?...`
- R: `Le taux de TVA standard en vigueur en Suisse depuis le 1er janvier 2024 est fixé à 8,1 % conformément à l'Art. 25 al. 1 LTVA (RS 641.20) et à l'Art. 4...`
- Score contains: 100% | regex: Y | must_not: OK

### conseiller

**conseiller-003** (standard)
- Q: `Quand une PME suisse devient-elle obligatoirement assujettie à la TVA?...`
- R: `**Constat**
Une PME n'est pas automatiquement assujettie à la TVA dès sa création. L'obligation dépend du volume de ses prestations imposables sur le ...`
- Score contains: 60% | regex: Y | must_not: OK

---

## Top 10 Failures Critiques

| # | Agent | ID | Q (extrait) | Contains | Regex | Must-not |
|---|-------|----|-------------|----------|-------|----------|
| 1 | tva | tva-004 | `Quels sont les seuils d'éligibilité à la méthode TDFN en 202...` | 33% | N | OK |
| 2 | conseiller | conseiller-003 | `Quand une PME suisse devient-elle obligatoirement assujettie...` | 60% | Y | OK |
| 3 | tva | tva-009 | `Quel sera le taux TVA standard en Suisse en 2099?...` | 100% | Y | OK |
---

## Verdict final

****QUALITÉ PARTIELLE** — vLLM acceptable mais amélioration recommandée.**

- Accuracy globale agents : 85.0%
- Accuracy edge cases : 0.0%
- Aucun agent en dessous du seuil de 80%.

---
*Généré par run_quality.py — tests vLLM migration Lexa*