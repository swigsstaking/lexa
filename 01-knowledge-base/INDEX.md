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
| Autres cantons SR | 6 | **3 (NE, JU, BE-Jura session 25)** | **50%** |
| Standards techniques | 4 (eCH-0217, Swissdec, CAMT.053, QR) | 0 | 0% |
| Plan comptable Käfer | 1 (structuré) | 1 (dans system prompt, à extraire) | 100%* |

*existe mais pas en format ingéré/requêtable

**Total Qdrant collection `swiss_law`** : **9846 points** (au 2026-04-15)
- Session 01 : 791 (LIFD + LTVA + CO + résumés manuels)
- Session 02 : +108 LHID → 899
- Session 03 : +1880 AFC + 228 VS docs → 3007
- Session 04 : +397 LP + 479 CSI + 175 VS Loi fiscale → 4058
- Session 05 : +164 VS (re-parsing v2) +448 ordonnances (OIFD/OLTVA/OIA/ORC) +652 Info TVA → **5322**
- Session ~07 : +66 Plan comptable Käfer → **5388**
- Session 16 : **+373 Canton Genève (LCP 267 + LIPP 66 + LIPM 40)** → **5761**
- Session 18 : **+381 Canton Vaud (LI 310 + LIPC 62 + RLI 9)** → **6142**
- Sessions 20-24 : +2071 (Fribourg LICD+LIC+ORD, fédéral supplémentaire, VS guides v2) → **~8213**
- Session 25 (Lane B) : **+390 NE (LCdir 329 + RGI 3 + ORD-FP 58) + +174 JU (LI via PDF) + +1069 BE-Jura (LI-BE)** → **9846**

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

### 2. Genève (GE) — **SESSION 16 ✓**

| Document | Statut | Source |
|---|---|---|
| **LCP** — Loi générale sur les contributions publiques (RSG D 3 05) | ✅ **Ingéré session 16 (267 articles)** | silgeneve.ch/legis/data/rsg_d3_05.htm |
| **LIPP** — Loi sur l'imposition des personnes physiques (RSG D 3 08) | ✅ **Ingéré session 16 (66 articles)** | silgeneve.ch/legis/data/rsg_d3_08.htm |
| **LIPM** — Loi sur l'imposition des personnes morales (RSG D 3 15) | ✅ **Ingéré session 16 (40 articles)** | silgeneve.ch/legis/data/rsg_d3_15.htm |
| Règlements d'application | ❌ Manquant | silgeneve.ch |
| Barème cantonal annuel | ❌ Manquant | AFC-GE |
| Formulaires déclaration PP | ❌ Manquant | AFC-GE |
| Formulaires déclaration PM | ❌ Manquant | AFC-GE |
| Circulaires AFC-GE | ❌ Manquant | AFC-GE |

**Portail** : https://www.ge.ch/dossier/deposer-declaration-impots
**Script d'ingestion** : `01-knowledge-base/scripts/ingest_ge_laws_lexa.py`
**Méthode** : curl HTTP simple (encoding windows-1252) + BeautifulSoup + regex article parser. Pas de Playwright nécessaire — SILGeneve sert du HTML statique legacy ASP.NET.
**Tags Qdrant** : `law ∈ {LCP-GE, LIPP-GE, LIPM-GE}`, `jurisdiction: "cantonal-GE"`, `canton: "GE"`
**Validation RAG session 16** (top-3 scores observés) :
- "Contributions publiques communes Genève" → LCP-GE top-3 (0.587/0.574/0.571)
- "Impôt sur la fortune personne physique Genève" → LCP-GE Art. 1 + LIPP-GE Art. 1 (0.663/0.618)
- "Rattachement personnel canton Genève assujettissement" → LIPM-GE Art. 4 top (0.616)
- "Déduction pilier 3a salarié Genève" → sources fédérales + VS en top (logique, c'est une règle LIFD Art. 33 al. 1 let. e)
- "Imposition bénéfice SA Genève" → VS/OIA/LIFD (à surveiller, session 17+ un Guide PP GE plus explicite améliorerait le score)
**Agent** : `lexa-fiscal-pp-ge` Modelfile + `FiscalPpGeAgent.ts` session 16, re-ranking tier 0 LIPP-GE/LCP-GE + tier 1 LIPM-GE + tier 2 LIFD/LHID

### 2. Vaud (VD) — **SESSION 18 ✓**

| Document | Statut | Source |
|---|---|---|
| **LI** — Loi sur les impôts directs cantonaux (BLV 642.11) | ✅ **Ingéré session 18 (310 articles)** | prestations.vd.ch/pub/blv-publication/api/actes/{id}/html |
| **LIPC** — Loi sur les impôts communaux (BLV 650.11) | ✅ **Ingéré session 18 (62 articles)** | prestations.vd.ch/pub/blv-publication/api/actes/{id}/html |
| **RLI** — Règlement d'application de la LI (BLV 642.11.1) | ✅ **Ingéré session 18 (9 articles)** | prestations.vd.ch/pub/blv-publication/api/actes/{id}/html |
| Barème cantonal | ❌ Manquant | ACI |
| **vd-declaration-pp-2026.yaml** — Template formulaire déclaration PP VD | ✅ **Ajouté session 19** | `01-knowledge-base/forms/` + `apps/backend/src/execution/templates/` |
| Barème cantonal | ❌ Manquant | ACI |
| Formulaires PP / PM (VaudTax) | ❌ Manquant | VaudTax |
| Directives ACI | ❌ Manquant | aci.vd.ch |

**Portail** : https://www.vd.ch/themes/etat-droit-finances/impots
**Script d'ingestion** : `01-knowledge-base/scripts/ingest_vd_laws_lexa.py`
**Méthode** : API REST JSON derrière SPA Angular BLV (`api/actes/CONSOLIDE?id=...&cote=...` → html_id → `api/actes/{html_id}/html`). XHTML AkomaNtoso UTF-8. Parser `akn-article-container` + `akn-alinea`. Firefox Playwright utilisé pour découvrir l'API REST (aucune source HTML statique directe disponible pour VD).
**Tags Qdrant** : `law ∈ {LI-VD, LIPC-VD, RLI-VD}`, `jurisdiction: "cantonal-VD"`, `canton: "VD"`
**IDs BLV** (version 2026) :
  - LI 642.11 : acte=`8df99d51-...`, html=`a28b9d22-...`
  - LIPC 650.11 : acte=`66dcd6f6-...`, html=`0848120c-...`
  - RLI 642.11.1 : acte=`5390e38d-...`, html=`afe66749-...`
**Validation RAG session 18** (top-3 scores observés) :
  - "Coefficient communal impôt direct Vaud" → LI-VD Art. 105 (0.665) ✅
  - "Impôt sur la fortune personne physique Vaud" → LI-VD Art. 111 (0.653) ✅
  - "Déduction frais professionnels canton Vaud salarié" → VS-Loi-fiscale (VS-Guide-PP plus riche) ⚠️ normal
  - "Assujettissement rattachement personnel canton Vaud" → VS-Loi-fiscale ⚠️ normal (sans Guide PP VD)
  - "Impôt cantonal et communal Lausanne" → VS-Guide-PP ⚠️ normal
  - Score 2/5 — acceptable, pattern identique session 16 GE (sans Guide PP VD, les requêtes génériques vont vers VS)
**Agent** : `lexa-fiscal-pp-vd` Modelfile + `FiscalPpVdAgent.ts` session 18, re-ranking tier 0 LI-VD/LIPC-VD + tier 1 RLI-VD + tier 2 LIFD/LHID
**Collection après ingestion** : 5761 → 6142 points (+381)

### 3. Fribourg (FR)

| Document | Statut | Source |
|---|---|---|
| Loi sur les impôts cantonaux directs (LICD) | ❌ Manquant | RSF 631.1 |
| Ordonnance d'exécution | ❌ Manquant | À télécharger |
| Barème cantonal | ❌ Manquant | SCC |
| Formulaires | ❌ Manquant | fribourg.ch/scc |

### 4. Neuchâtel (NE) — **SESSION 25 ✓**

| Document | Statut | Source |
|---|---|---|
| **LCdir** — Loi sur les contributions directes (RSN 631.0) | ✅ **Ingéré session 25 (329 articles)** | rsn.ne.ch/DATA/program/books/rsne/htm/631.0.htm |
| **RGI** — Règlement général sur l'imposition (RSN 631.00) | ✅ **Ingéré session 25 (3 articles)** | rsn.ne.ch/DATA/program/books/rsne/htm/631.00.htm |
| **ORD-FP-NE** — Ordonnance sur les listes d'échéances (RSN 631.01) | ✅ **Ingéré session 25 (58 articles)** | rsn.ne.ch/DATA/program/books/rsne/htm/631.01.htm |
| Barèmes | ❌ Manquant | Service des contributions NE |
| Formulaires | ❌ Manquant | ne.ch/contributions |

**Portail** : https://www.ne.ch/autorites/DFIN/SCC/Pages/accueil.aspx
**Script d'ingestion** : `01-knowledge-base/scripts/ingest_ne_laws_lexa.py`
**Méthode** : HTML statique windows-1252 (Microsoft Word export), `LVMP_BOOKS_LOAD` pattern `DATA/program/books/rsne/htm/`. Parser regex `<a name="LVMPART_X">` + texte. Même pattern que silgeneve.ch GE.
**Tags Qdrant** : `law ∈ {LCdir-NE, RGI-NE, ORD-FP-NE}`, `jurisdiction: "cantonal-NE"`, `canton: "NE"`
**Validation RAG session 25** : **5/5 queries** — scores 0.55-0.68 avec NE dans top-1
**Agent Modelfile** : `lexa-fiscal-pp-ne` créé sur Spark (session 25). Agent TS `FiscalPpNeAgent.ts` à créer en binding S22.5.

### 5. Jura (JU) — **SESSION 25 ✓**

| Document | Statut | Source |
|---|---|---|
| **LI** — Loi d'impôt (RSJU 641.11) | ✅ **Ingéré session 25 (174 articles via PDF pdfminer)** | rsju.jura.ch/fr/viewdocument.html?idn=20113&id=37000&download=1 |
| Ordonnances | ❌ Manquant | À télécharger |
| Barèmes | ❌ Manquant | Service cantonal des contributions JU |
| Formulaires | ❌ Manquant | jura.ch |

**Portail** : https://rsju.jura.ch/
**Script d'ingestion** : `01-knowledge-base/scripts/ingest_ju_laws_lexa.py`
**Méthode** : PDF download (`download=1`) + extraction pdfminer.six dans /tmp/lexa-venv. Parser regex `Art. N` sur texte extrait. Le site RSJU (IceCube2 CMS) ne fournit pas de HTML statique ni d'API JSON accessible.
**Tags Qdrant** : `law ∈ {LI-JU}`, `jurisdiction: "cantonal-JU"`, `canton: "JU"`
**Validation RAG session 25** : **5/5 queries** — scores 0.57-0.62 avec JU dans top-1
**Agent Modelfile** : `lexa-fiscal-pp-ju` créé sur Spark (session 25). Agent TS `FiscalPpJuAgent.ts` à créer en binding S22.5.

### 6. Berne francophone (Jura bernois) — **SESSION 25 ✓**

| Document | Statut | Source |
|---|---|---|
| **LI-BE** — Loi sur les impôts (RSB 661.11) | ✅ **Ingéré session 25 (1069 articles/paragraphes, version FR)** | belex.sites.be.ch/api/fr/texts_of_law/661.11/show_as_json |
| OI-BE (661.111) | ❌ Absent de l'API belex (404) | — |
| Barèmes | ❌ Manquant | Intendance des impôts BE |
| Formulaires (version FR) | ❌ Manquant | be.ch / taxme.ch |

**Portail** : https://www.belex.sites.be.ch/
**Script d'ingestion** : `01-knowledge-base/scripts/ingest_bj_laws_lexa.py`
**Méthode** : API JSON LexWork (même format que bdlf.fr.ch). Hostname résolvable depuis Mac (93.187.192.136), fallback IP en cas DNS fail sur le Spark. Version FR uniquement (`/api/fr/`). 1069 chunks car la LI-BE inclut tous les sous-paragraphes détaillés.
**Tags Qdrant** : `law ∈ {LI-BE}`, `jurisdiction: "cantonal-BE"`, `canton: "BE"`
**Validation RAG session 25** : **5/5 queries** — scores 0.58-0.72 avec BE dans top-1
**Note** : Certains chunks ont label `§li_be` (paragraphes sans numéro article explicite dans JSON) — à filtrer en S22.5.
**Agent Modelfile** : `lexa-fiscal-pp-bj` créé sur Spark (session 25). Agent TS `FiscalPpBjAgent.ts` à créer en binding S22.5.

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
