# Lane B — Ingestion barèmes ICC 2026 — Session parallèle S32

**Date** : 2026-04-16
**Agent** : Sonnet 4.6 (instance dev)
**Lane** : B (parallèle à Lane A — Session 32 mode fiduciaire multi-clients)
**Durée** : ~2h

---

## État initial

- Collection Qdrant `swiss_law` : **9846 points**
- Services : Qdrant ✅ | Embedder BGE-M3 ✅ | Ollama ✅ | API Lexa ✅
- Branch git : `main` (up-to-date)
- Zone `apps/` : **non touchée** (file set disjoint respecté)

---

## Bloc A — Recherche sources

### Méthode utilisée

Sites officiels cantonaux inaccessibles via WebFetch (protection bot, SPAs Angular, CF checks) :
- vs.ch/scc → CloudFlare verification
- ge.ch/afc → page 404
- vd.ch/aci → redirect HTTP→HTTPS, SPA Angular
- fr.ch/scc → FriTax 2025 mais pas barèmes 2026

**Alternative réussie** : Query Qdrant directe sur la collection `swiss_law` existante.
Les textes de lois des 4 cantons SR étaient déjà ingérés depuis les sessions 16/18/20-24 :

| Canton | Loi ingérée | Articles clés trouvés | Score top-1 |
|---|---|---|---|
| VS | VS-Loi-fiscale (RSVS 642.1) + VS-Guide-PP | Art. 32 (barème PP), Art. 89/99 (PM bénéfice/capital), Art. 180a | 0.647-0.703 |
| GE | LIPP-GE (RSG D 3 08) + LIPM-GE (RSG D 3 15) | Art. 41 **complet** (18 tranches PP), Art. 20 (PM 3.33%), Art. 33 (capital 1.8‰) | 0.604-0.629 |
| VD | LI-VD (BLV 642.11) | Art. 47 (struct. PP, barème délégué CE), Art. 105/118 (PM) | 0.603-0.719 |
| FR | LICD-FR (RSF 631.1) | §licd_fr (PM bénéfice 4%, capital 1‰/0.1‰, PP "barème SCC") | 0.587-0.672 |

### Confiance source par cellule

| Canton | PP confiance | PM confiance | Raison |
|---|---|---|---|
| VS | **medium** | **high** | Art. 32 tronqué (tranches > 152k manquantes dans chunk) ; PM articles complets |
| GE | **high** | **high** | Art. 41 LIPP complet (18 tranches) ; Art. 20/33/34 LIPM complets |
| VD | **medium** | **high** | Art. 47 LI délègue barème au CE (arrêté annuel, pas dans loi) ; PM arts. 105/118 complets |
| FR | **medium** | **high** | LICD délègue barème PP au SCC (§licd_fr) ; PM taux confirmés dans chunks |

---

## Bloc B — 8 YAML créés

| Fichier | Taille | Contenu | Confiance |
|---|---|---|---|
| `vs-pp-2026.yaml` | 3'297 bytes | Art. 32 tranches, réductions mariés/famille, frais prof | medium |
| `vs-pm-2026.yaml` | 4'094 bytes | Art. 89 (cantonal 2.25%/5.2%), Art. 180a (communal 2.75%/6.75%), Art. 99 (capital 1‰/2.5‰) | high |
| `ge-pp-2026.yaml` | 4'880 bytes | Art. 41 LIPP 18 tranches complètes (0% → 18%), Art. 59 fortune | high |
| `ge-pm-2026.yaml` | 3'417 bytes | Art. 20 bénéfice 3.33%, Art. 33 capital 1.8‰, Art. 34 réduit 0.005‰, Art. 36 assoc. | high |
| `vd-pp-2026.yaml` | 4'134 bytes | Art. 47 structure + tranches approx. S22, quotient familial, coeff. annuel | medium |
| `vd-pm-2026.yaml` | 3'623 bytes | Art. 105 bénéfice 3.333%/3.75%, Art. 118 capital 0.6‰, réductions participations | high |
| `fr-pp-2026.yaml` | 4'315 bytes | Tranches approx. S22, taux max légal 20% confirmé LICD, ORD-FP 631.411 | medium |
| `fr-pm-2026.yaml` | 3'626 bytes | Bénéfice 4% (confirmé ×2 chunks), capital 1‰ + 0.1‰ participations | high |

**Total : 8 fichiers dans `01-knowledge-base/baremes/`**

---

## Bloc C — Script d'ingestion

**Fichier** : `01-knowledge-base/scripts/ingest_baremes_icc_2026.py`

Caractéristiques :
- IDs Qdrant stables (hash 63-bit `"bareme-{canton}-{entity}-{year}"`)
- Textes RAG-optimisés (tranches formatées, notes sources)
- Payload enrichi : `law=baremes-officiels-icc`, `canton`, `entity`, `year`, `source_confidence`
- Idempotent (upsert, pas d'insert pur)
- Paramètres CLI : `--baremes-dir`, `--dry-run`
- Statut Qdrant `completed` reconnu comme valide (fix post-premier-run)

**Exécution sur Spark** :
```
ssh swigs@192.168.110.59 'python3 /home/swigs/ingest_baremes_icc_2026.py --baremes-dir /home/swigs/baremes_icc_2026/baremes'
```

**Résultat** : 9846 → **9854 points** (+8) ✅

---

## Bloc D — Tests RAG

### Queries originales de la mission

| Query | Attendu | Top-1 obtenu | Score | Résultat |
|---|---|---|---|---|
| "Barème impôt cantonal VS salarié célibataire 2026" | VS PP | VD PP | 0.703 | ✗ |
| "Taux ICC Genève personne morale bénéfice" | GE PM | GE PP | 0.707 | ✗ |
| "Barème impôt fribourgeois PP 2026" | FR PP | FR PP | 0.737 | ✓ |
| "Impôt capital Vaud Sàrl" | VD PM | VD PM | 0.652 | ✓ |

**Score sans filtre : 2/4** (seuil mission = 3/4 — non atteint)

### Analyse des échecs

Les 2 échecs sont des confusions intra-canton PP/PM :
- Q1 : "VS salarié célibataire" retourne VD PP (similitude sémantique très forte VD/VS + PP/PP)
- Q2 : "GE personne morale bénéfice" retourne GE PP (chunk PP contient "impôt" + "GE" avec haute densité)

**Les bons résultats sont en top-2** dans les deux cas (VS PP score 0.691, GE PM score 0.699).

### Tests avec filtre entity=PM (confirmés ✅)

| Query filtré | Résultat |
|---|---|
| bénéfice sociétés GE, filtre entity=PM, canton=GE | GE PM ✓ (0.657) |
| impôt capital Valais sociétés, filtre entity=PM, canton=VS | VS PM ✓ (0.628) |

**Recommandation** : En production Lexa, les agents RAG doivent filtrer par `entity` (PP/PM) avant la recherche sémantique. L'intégration backend post-S32 devra implémenter ce filtre.

---

## Bloc E — INDEX.md

Section **"Barèmes fiscaux officiels 2026"** ajoutée dans `01-knowledge-base/INDEX.md` :
- Tableau 4 cantons × PP/PM avec confiance
- Sources URL par canton
- Liste des 7 dettes session 35+
- Version INDEX passée de 0.1 → 0.2

---

## Résumé dettes pour session future

### Haute priorité (bloquant intégration backend)

1. **Intégration backend** : `taxEstimator.ts` + `pmTaxEstimator.ts` → remplacer approximations S22 par lecture des YAML barèmes (session dédiée post-S32, ne pas toucher pendant que Lane A travaille sur les fichiers)

### Moyenne priorité (amélioration données)

2. **VS PP tranches hautes** (> 152'400 CHF) : chunk Art. 32 tronqué — re-scraper lex.vs.ch
3. **VD PP barème tabulaire 2026** : Arrêté CE annuel — scraper vd.ch/aci/barèmes
4. **FR PP barème tabulaire 2026** : Publication SCC-FR — contacter SCC ou PDF annuel
5. **GE PP tarif marié** : Art. 41 al. 2 LIPP manquant dans chunk ingéré
6. **FR PM capital SA/Sàrl** : Taux standard pour sociétés de capitaux (LICD art. spécifique non trouvé)

### Basse priorité

7. **VS PP tarif marié** : Récupérer Art. 32a + suivants LF VS
8. **Coefficients communaux** : Compilation par commune pour VS, VD, FR (VardosDb ?)
9. **Tests RAG PP/PM** : Améliorer queries de test pour atteindre 4/4 avec filtre entity

---

## Git

- Commits prévus : 3
  1. `feat(kb): baremes ICC officiels 2026 — 4 cantons SR PP+PM (8 YAML + Qdrant)`
  2. `docs(kb): INDEX.md section barèmes + sources documentées`
  3. `docs(lane-b-baremes-icc): journal session parallèle S32`
