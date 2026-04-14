# Base de connaissances Lexa — Index

**Version** : 0.1
**Date** : 2026-04-13

---

## Statut global

| Catégorie | Documents prévus | Déjà ingérés | % |
|---|---|---|---|
| Fédéral — lois | 5 (LIFD, LHID, LTVA, CO, LP) | **5 (LIFD, LTVA, CO, LHID, LP)** | **100% ✓** |
| Fédéral — ordonnances clés | 4 (OIFD, OLTVA, OIA, ORC) | **4 (OIFD, OLTVA, OIA, ORC)** | **100% ✓** |
| Fédéral — circulaires AFC IFD | ~40 | **14 (sélection prioritaire)** | **~35%** |
| Fédéral — notices AFC | ~15 | **1 (Notice A 1995 entreprises commerciales, complète)** | ~7% |
| Fédéral — Info TVA (webpublications) | ~15 | **4 (TVA 12 TDFN, TVA 15 décompte, secteur 17 immeubles, secteur 04 bâtiment)** | **~27%** |
| Fédéral — CSI circulaires | 2 (Circ 28 + commentaire) | **2 (Circ 28 2022 + commentaire 2023)** | **100% ✓** |
| Fédéral — jurisprudence TF | 0 (à décider scope) | 0 | — |
| Cantonal VS — **loi fiscale** | 1 | **1 (RSVS 642.1, 339 articles via Playwright v2)** | **100% ✓** |
| Cantonal VS — directives / guides | ~10 | **4 (Guide 2024, barème 2026, déductions, impôt source)** | ~40% |
| Autres cantons SR | 6 | 0 | 0% |
| Standards techniques | 4 (eCH-0217, Swissdec, CAMT.053, QR) | 0 | 0% |
| Plan comptable Käfer | 1 (structuré) | 1 (dans system prompt, à extraire) | 100%* |

*existe mais pas en format ingéré/requêtable

**Total Qdrant collection `swiss_law`** : **5322 points**
- Session 01 : 791 (LIFD + LTVA + CO + résumés manuels)
- Session 02 : +108 LHID → 899
- Session 03 : +1880 AFC + 228 VS docs → 3007
- Session 04 : +397 LP + 479 CSI + 175 VS Loi fiscale → 4058
- Session 05 : +164 VS (re-parsing v2) +448 ordonnances (OIFD/OLTVA/OIA/ORC) +652 Info TVA → **5322**

Voir [`federal/circulaires-afc-index.md`](federal/circulaires-afc-index.md) pour le détail des documents AFC ingérés.

---

## Fédéral

### Lois fondamentales

| Document | RS | Statut | URL Fedlex | Notes |
|---|---|---|---|---|
| **LIFD** — Loi fédérale sur l'impôt fédéral direct | 642.11 | ✅ Ingéré (224 articles) | [xml](https://fedlex.data.admin.ch/filestore/...) | Version 2025-01-01 déjà sur Spark |
| **LHID** — Loi sur l'harmonisation des impôts directs | 642.14 | ✅ **Ingéré (108 articles, session 02)** | [xml](https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1991/1256_1256_1256/20250101/fr/xml/fedlex-data-admin-ch-eli-cc-1991-1256_1256_1256-20250101-fr-xml-1.xml) | Version 2025-01-01 — script `~/ollama-compta/scripts/ingest_lhid_lexa.py` |
| **LTVA** — Loi sur la TVA | 641.20 | ✅ Ingéré (131 articles) | [xml](https://fedlex.data.admin.ch/filestore/...) | Version 2025-01-01 |
| **CO** — Code des obligations (titre 32, art. 957-963b) | 220 | ✅ Ingéré (421 articles — dont d'autres titres) | [xml](https://fedlex.data.admin.ch/filestore/...) | Version 2025-10-01. Filtrer sur 957-963b ? |
| **LP** — Loi sur la poursuite pour dettes et la faillite | 281.1 | ❌ Manquant | À télécharger | Priorité moyenne (procédures) |
| **Cst** — Constitution fédérale (art. 127-135 fiscalité) | 101 | ❌ Manquant | À télécharger | Priorité basse (principe général) |
| **Swiss GAAP RPC** | — | ❌ Skippé v1 | Payant (~500 CHF) | Référentiel comptable premium — à ajouter en v2 si un client beta en a besoin (caisses de pension, coopératives, cotées) |

### Ordonnances fédérales

| Document | RS | Statut | Priorité |
|---|---|---|---|
| **OIFD** — Ordonnance sur l'impôt fédéral direct | 642.116 | ❌ Manquant | Haute |
| **OLTVA** — Ordonnance sur la TVA | 641.201 | ❌ Manquant | Haute |
| **ORC** — Ordonnance sur le registre du commerce | 221.411 | ❌ Manquant | Moyenne |
| **OLICD** — Ordonnance sur le compte et rapport de gestion | 221.431 | ❌ Manquant | Moyenne |

### Circulaires AFC (Administration fédérale des contributions)

À cataloguer et prioriser. Sources :
- https://www.estv.admin.ch/estv/fr/accueil/impot-federal-direct/circulaires-ifd.html
- https://www.estv.admin.ch/estv/fr/accueil/tva/publications-tva/info-tva.html

**Exemples à ingérer en priorité** :
- Circulaire AFC n° 24 (réévaluation réserves)
- Circulaire AFC n° 34 (imposition des sociétés coopératives)
- Notice A (amortissements admis — déjà partiellement dans le prototype)
- Notice 1 (évaluation des titres non cotés)
- Info TVA 01 (méthode effective)
- Info TVA 03 (TDFN)
- Info TVA 14 (immeubles)

### Jurisprudence Tribunal fédéral

À décider : scope (tous les ATF fiscaux ? seulement les derniers 5 ans ?).
Source : https://www.bger.ch/

---

## Cantonal — Priorité Suisse romande

> **Ordre d'implémentation retenu** : **VS → GE → VD → FR → NE → JU → BE-Jura**.
> Le Valais est le premier canton cible : coefficients communaux très variables, règles spécifiques au tourisme/hôtellerie (taux TVA 3.8%), et marché fiduciaire moins saturé que Genève ou Vaud.

### 1. Valais (VS) — **PREMIER CANTON LEXA**

| Document | Statut | Source |
|---|---|---|
| Loi fiscale (LF) | ❌ Manquant | RSVS 642.1 |
| Règlement d'exécution (RELF) | ❌ Manquant | À télécharger |
| Barème cantonal 2026 | ❌ Manquant | Service cantonal des contributions VS |
| Coefficients communaux (variables par commune) | ❌ Manquant | Liste à compiler |
| Formulaires déclaration PP | ❌ Manquant | vs.ch |
| Formulaires déclaration PM | ❌ Manquant | vs.ch |
| Directives SCC-VS | ❌ Manquant | Service cantonal des contributions VS |
| Notice VS sur amortissements | ❌ Manquant | À vérifier |

**Portail** : https://www.vs.ch/web/scc
**Particularités** : forte variabilité communale, spécificités tourisme/hôtellerie, bilingue FR/DE (priorité FR pour Lexa v1).

### 2. Genève (GE)

| Document | Statut | Source |
|---|---|---|
| Loi générale sur les contributions publiques (LCP) | ❌ Manquant | https://www.ge.ch/legislation/ |
| Règlements d'application | ❌ Manquant | https://www.ge.ch/legislation/ |
| Loi sur l'imposition des personnes physiques (LIPP) | ❌ Manquant | À télécharger |
| Loi sur l'imposition des personnes morales (LIPM) | ❌ Manquant | À télécharger |
| Barème cantonal annuel | ❌ Manquant | AFC-GE |
| Formulaires déclaration PP | ❌ Manquant | AFC-GE |
| Formulaires déclaration PM | ❌ Manquant | AFC-GE |
| Circulaires AFC-GE | ❌ Manquant | AFC-GE |

**Portail** : https://www.ge.ch/dossier/deposer-declaration-impots

### 2. Vaud (VD)

| Document | Statut | Source |
|---|---|---|
| Loi sur les impôts directs cantonaux (LI) | ❌ Manquant | BLV 642.11 |
| Règlement d'application (RLI) | ❌ Manquant | BLV 642.11.1 |
| Barème cantonal | ❌ Manquant | ACI |
| Formulaires PP / PM | ❌ Manquant | VaudTax |
| Directives | ❌ Manquant | ACI |

**Portail** : https://www.vd.ch/themes/etat-droit-finances/impots

### 3. Fribourg (FR)

| Document | Statut | Source |
|---|---|---|
| Loi sur les impôts cantonaux directs (LICD) | ❌ Manquant | RSF 631.1 |
| Ordonnance d'exécution | ❌ Manquant | À télécharger |
| Barème cantonal | ❌ Manquant | SCC |
| Formulaires | ❌ Manquant | fribourg.ch/scc |

### 4. Neuchâtel (NE)

| Document | Statut | Source |
|---|---|---|
| Loi sur les contributions directes (LCdir) | ❌ Manquant | RSN 631.0 |
| Règlement général | ❌ Manquant | À télécharger |
| Barèmes | ❌ Manquant | Service des contributions NE |
| Formulaires | ❌ Manquant | ne.ch/contributions |

### 5. Jura (JU)

| Document | Statut | Source |
|---|---|---|
| Loi d'impôt | ❌ Manquant | RSJU 641.11 |
| Ordonnances | ❌ Manquant | À télécharger |
| Barèmes | ❌ Manquant | Service cantonal des contributions JU |
| Formulaires | ❌ Manquant | jura.ch |

### 7. Berne francophone (Jura bernois)

| Document | Statut | Source |
|---|---|---|
| Loi sur les impôts (LI-BE) | ❌ Manquant | RSB 661.11 |
| Ordonnances | ❌ Manquant | À télécharger |
| Barèmes | ❌ Manquant | Intendance des impôts BE |
| Formulaires (version FR) | ❌ Manquant | be.ch |

---

## Plan comptable

### Plan comptable PME suisse (Käfer)

**Statut** : existe en partie dans le system prompt de `comptable-suisse` (Classes 1-7 listées).
**Action** : extraire + structurer en base de données + ingérer dans Qdrant (chaque compte = 1 chunk).

**Structure cible** :

```yaml
account_id: "1020"
label: "Banque - compte courant"
class: 1
parent: "1000"  # Actifs circulants
type: "balance_sheet_asset"
nature: "liquid"
description: "…"
common_tva_codes: []
examples: ["Relevé bancaire", "Virement entrant", "Paiement sortant"]
```

**Classes principales** :
- **Classe 1** : Actifs (1000-1999)
- **Classe 2** : Passifs (2000-2999)
- **Classe 3** : Produits (3000-3999)
- **Classe 4** : Charges de matériel (4000-4999)
- **Classe 5** : Charges de personnel (5000-5999)
- **Classe 6** : Autres charges d'exploitation (6000-6999)
- **Classe 7** : Résultat accessoire (7000-7999)
- **Classe 8** : Résultat extraordinaire (8000-8999)
- **Classe 9** : Clôture (9000-9999)

### Plans spécialisés (phase 2)

- Plan comptable cabinet médical
- Plan comptable construction
- Plan comptable hôtellerie/restauration
- Plan comptable agricole

---

## Standards techniques

| Standard | Description | Statut | Source |
|---|---|---|---|
| **eCH-0217** | Échange fiscal suisse (XML) | ❌ Manquant | https://www.ech.ch/ |
| **Swissdec** | Transmission salariale | ❌ Manquant | https://www.swissdec.ch/ |
| **CAMT.053 / .054** | Relevé bancaire ISO 20022 | ❌ Manquant | https://www.iso20022.org/ |
| **QR-facture (QR-bill)** | Facture suisse avec QR | ❌ Manquant | https://www.six-group.com/ |
| **ISO 20022** | Messages financiers | ❌ Manquant | Standard de référence |

---

## Priorités d'ingestion (ordre recommandé)

### Sprint 1 (compléter le fédéral)
1. **LHID** (642.14) — fondamental pour le cantonal
2. **OIFD** et **OLTVA** — ordonnances d'exécution
3. **Notices AFC principales** (Notice A complète, Notice 1, Info TVA 01, Info TVA 03)
4. **LP** (281.1) — procédures de poursuite

### Sprint 2 (premier canton SR) — **Valais (VS)**
Choix retenu : VS (moins saturé que GE/VD, spécificités touristiques utiles pour valider les cas particuliers TVA 3.8%) :
1. Loi fiscale VS (RSVS 642.1)
2. Règlement d'exécution (RELF)
3. Formulaires PP + PM Valais
4. Barème cantonal 2026
5. Coefficients communaux (compilation par commune)
6. Directives SCC-VS principales

### Sprint 3 (deuxième canton) — **Genève (GE)**
Répéter la méthode pour GE : LCP, LIPP, LIPM, règlements, barèmes, formulaires.

### Sprint 4 (autres cantons SR)
VD → FR → NE → JU → BE-Jura dans cet ordre.

### Sprint 4 (standards + plan comptable)
1. Plan comptable Käfer structuré
2. eCH-0217 (schémas XML)
3. Swissdec (spécifications)
4. CAMT.053 (parser bancaire)
5. QR-facture (parser factures)

---

## Méthodologie d'ingestion

1. **Télécharger** la source officielle (format préféré : XML AkomaNtoso depuis Fedlex, sinon PDF structuré)
2. **Parser** en articles atomiques (1 article = 1 chunk)
3. **Enrichir** avec métadonnées (RS, date effective, topic, juridiction)
4. **Embedder** avec BGE-M3
5. **Upserter** dans Qdrant `swiss_law`
6. **Valider** avec quelques queries de test (le document ressort correctement ?)
7. **Logger** l'ingestion dans un fichier d'audit

Le script `~/ollama-compta/scripts/ingest_laws_v2.py` sur le Spark est le point de départ — à adapter et enrichir.

---

## Gouvernance

- **Versioning** : chaque document a un `effective_from` et `effective_to`. Pas de suppression destructive.
- **Source of truth** : toujours Fedlex pour le fédéral, le site officiel cantonal pour le cantonal.
- **Validation humaine** : toute nouvelle loi ingérée est revue par un expert (fiduciaire partenaire, phase beta).
- **Veille** : cron quotidien sur Fedlex RSS + sites cantonaux pour détecter les nouveautés.
