# Benchmark OCR — 2026-04-16

Fixture : test-cert-salaire-1.png (150804 bytes, 1 page, texte lisible)  
Iterations : 3 par modèle  
Ollama : http://192.168.110.103:11434  

## Résultats

| Modèle | Latence moy. (ms) | Latence std (ms) | Précision champs | Format sortie | Taux échec |
|---|---|---|---|---|---|
| qwen3-vl-ocr | 22202 | 176 | 5.0 / 5 (100%) | text_plain | 0/3 |
| deepseek-ocr | 1698 | 1897 | 0.0 / 5 (0%) | empty | 0/3 |

## Détail par itération

### qwen3-vl-ocr

#### Iter 1
- durée : 21991 ms
- format : text_plain
- précision : 5/5
- champs détectés :
  - ✓ CERTIFICAT DE SALAIRE
  - ✓ Lexa Test SA (employeur)
  - ✓ 85000 / 85'000 (grossSalary CHF)
  - ✓ 72000 / 72'500 (netSalary CHF)
  - ✓ 2025 (année)
- raw output head (400 chars) :
```
CERTIFICAT DE SALAIRE 2025
Formulaire officiel — AFC Suisse
Informations employeur
Employeur : Lexa Test SA
Adresse : Rue du Grand-Pont 12, 1950 Sion
Numéro AVS employeur : 109.123.456
Informations employé
Nom : TEST Jean
Adresse : Chemin des Fleurs 5, 1950 Sion
Numéro AVS : 756.1234.5678.97
Période d'emploi : 01.01.2025 - 31.12.2025
Rémunération
Salaire brut annuel : CHF 85'000.00
Déductions AVS/
```

#### Iter 2
- durée : 22421 ms
- format : text_plain
- précision : 5/5
- champs détectés :
  - ✓ CERTIFICAT DE SALAIRE
  - ✓ Lexa Test SA (employeur)
  - ✓ 85000 / 85'000 (grossSalary CHF)
  - ✓ 72000 / 72'500 (netSalary CHF)
  - ✓ 2025 (année)
- raw output head (400 chars) :
```
CERTIFICAT DE SALAIRE 2025
Formulaire officiel — AFC Suisse
Informations employeur
Employeur : Lexa Test SA
Adresse : Rue du Grand-Pont 12, 1950 Sion
Numéro AVS employeur : 109.123.456
Informations employé
Nom : TEST Jean
Adresse : Chemin des Fleurs 5, 1950 Sion
Numéro AVS : 756.1234.5678.97
Période d'emploi : 01.01.2025 - 31.12.2025
Rémunération
Salaire brut annuel : CHF 85'000.00
Déductions AVS/
```

#### Iter 3
- durée : 22193 ms
- format : text_plain
- précision : 5/5
- champs détectés :
  - ✓ CERTIFICAT DE SALAIRE
  - ✓ Lexa Test SA (employeur)
  - ✓ 85000 / 85'000 (grossSalary CHF)
  - ✓ 72000 / 72'500 (netSalary CHF)
  - ✓ 2025 (année)
- raw output head (400 chars) :
```
CERTIFICAT DE SALAIRE 2025
Formulaire officiel — AFC Suisse
Informations employeur
Employeur : Lexa Test SA
Adresse : Rue du Grand-Pont 12, 1950 Sion
Numéro AVS employeur : 109.123.456
Informations employé
Nom : TEST Jean
Adresse : Chemin des Fleurs 5, 1950 Sion
Numéro AVS : 756.1234.5678.97
Période d'emploi : 01.01.2025 - 31.12.2025
Rémunération
Salaire brut annuel : CHF 85'000.00
Déductions AVS/
```

### deepseek-ocr

#### Iter 1
- durée : 4381 ms
- format : empty
- précision : 0/5
- champs détectés :
  - ✗ CERTIFICAT DE SALAIRE
  - ✗ Lexa Test SA (employeur)
  - ✗ 85000 / 85'000 (grossSalary CHF)
  - ✗ 72000 / 72'500 (netSalary CHF)
  - ✗ 2025 (année)
- raw output head (400 chars) :
```

```

#### Iter 2
- durée : 369 ms
- format : empty
- précision : 0/5
- champs détectés :
  - ✗ CERTIFICAT DE SALAIRE
  - ✗ Lexa Test SA (employeur)
  - ✗ 85000 / 85'000 (grossSalary CHF)
  - ✗ 72000 / 72'500 (netSalary CHF)
  - ✗ 2025 (année)
- raw output head (400 chars) :
```

```

#### Iter 3
- durée : 343 ms
- format : empty
- précision : 0/5
- champs détectés :
  - ✗ CERTIFICAT DE SALAIRE
  - ✗ Lexa Test SA (employeur)
  - ✗ 85000 / 85'000 (grossSalary CHF)
  - ✗ 72000 / 72'500 (netSalary CHF)
  - ✗ 2025 (année)
- raw output head (400 chars) :
```

```

## Décision

**GARDER → qwen3-vl-ocr reste le modèle OCR principal**

Raison : deepseek-ocr précision 0% < qwen3-vl-ocr 100% — qualité insuffisante.

## Critères de décision appliqués

1. **Taux échec** (bloquant) : deepseek-ocr ≥ 2/3 échecs → GARDER
2. **Précision champs** : deepseek doit être ≥ qwen3-vl-ocr (tolérance -5%)
3. **Latence** : deepseek doit être ≤ qwen3-vl-ocr × 1.2 (tolérance 20%)
4. **Déterminisme** : text_plain > json_wrapped (avantage deepseek, peut compenser latence +20%)