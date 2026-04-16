# Benchmark OCR — 2026-04-16

Fixture : test-cert-salaire-1.png (150804 bytes, 1 page, texte lisible, converti depuis PDF PDFKit)  
Iterations : 3 par modèle  
Ollama : http://192.168.110.103:11434  

## Statut : INCOMPLET — Réseau .59 inaccessible

### Problèmes identifiés et corrigés pendant la session

#### Problème 1 : PDF brut incompatible avec Ollama images[]

**Run initial (12:06:40 UTC)** : Le script v1 envoyait le PDF base64 directement dans `images[]`.
Ollama retourne HTTP 500 pour les 2 modèles car il n'accepte que PNG/JPEG dans ce champ, pas les PDF.

```
qwen3-vl-ocr : 3/3 × HTTP 500 (iter1: 5729ms, iter2: 95ms, iter3: 82ms)
deepseek-ocr  : 3/3 × HTTP 500 (iter1: 3079ms, iter2: 85ms, iter3: 71ms)
```

La latence quasi-nulle des iter 2 et 3 indique que le modèle refuse immédiatement après avoir tenté de parser le PDF.

**Correction apportée** : Script v2 utilise maintenant un PNG pré-converti.

#### Problème 2 : pdf-parse incompatible avec PDFKit

`pdf-parse@1.1.1` lève `bad XRef entry` sur les PDF générés par PDFKit — le même problème
identifié en session 23 (fallback vision). Ce bug affecte aussi bien le benchmark que le
pipeline de production OcrExtractor.ts.

**Note** : Ce problème impacte OcrExtractor.ts en production — tous les PDF PDFKit envoyés
par les clients passeront par le fallback vision, ce qui est plus lent et moins fiable.

#### Problème 3 : Réseau .110.x inaccessible depuis la machine locale

Après la première exécution du benchmark (~3 min de session SSH active), le sous-réseau
192.168.110.0/24 est devenu inaccessible depuis la machine locale (192.168.1.50).
L'API publique (https://lexa.swigs.online) reste fonctionnelle — les serveurs tournent.

### Fixtures préparées pour le prochain run

- `test-cert-salaire.pdf` : Régénéré (2209 bytes, PDFKit, contenu correct)
- `test-cert-salaire-1.png` : Converti via pdftoppm -r 150 (150804 bytes, 1 page)

Le PNG est la fixture correcte pour le benchmark vision.

## Résultats (à compléter au prochain run)

| Modèle | Latence moy. (ms) | Latence std (ms) | Précision champs | Format sortie | Taux échec |
|---|---|---|---|---|---|
| qwen3-vl-ocr | N/A | N/A | N/A | N/A | 3/3 (format incorrect v1) |
| deepseek-ocr | N/A | N/A | N/A | N/A | 3/3 (format incorrect v1) |

**Les échecs sont 100% dus à l'envoi de PDF dans images[], pas aux modèles eux-mêmes.**
Le script v2 (bench-ocr.ts) corrige ce problème.

## Décision

**À COMPLÉTER** — Le benchmark avec PNG doit être exécuté pour prendre une décision.

Garder qwen3-vl-ocr par défaut en attendant.

## Critères de décision appliqués

1. **Taux échec** (bloquant) : deepseek-ocr ≥ 2/3 échecs → GARDER
2. **Précision champs** : deepseek doit être ≥ qwen3-vl-ocr (tolérance -5%)
3. **Latence** : deepseek doit être ≤ qwen3-vl-ocr × 1.2 (tolérance 20%)
4. **Déterminisme** : text_plain > json_wrapped (avantage deepseek, peut compenser latence +20%)

## Pour relancer le benchmark (Session 25 ou suivante)

```bash
# 1. Déployer le script v2 et le PNG sur le serveur
rsync -avz apps/backend/src/scripts/bench-ocr.ts \
           apps/backend/src/scripts/fixtures/test-cert-salaire-1.png \
           swigs@192.168.110.59:/home/swigs/lexa-backend/src/scripts/fixtures/

# 2. Exécuter sur le serveur
ssh swigs@192.168.110.59 'cd /home/swigs/lexa-backend && OLLAMA_URL=http://192.168.110.103:11434 npx tsx src/scripts/bench-ocr.ts'

# 3. Récupérer les résultats
rsync -avz swigs@192.168.110.59:/home/swigs/lexa-backend/src/scripts/bench-ocr-results.md \
           apps/backend/src/scripts/

# 4. Committer le rapport final
git add apps/backend/src/scripts/bench-ocr-results.md
git commit -m "docs(ocr): résultats benchmark session 24.5 — qwen3-vl-ocr vs deepseek-ocr"
```
