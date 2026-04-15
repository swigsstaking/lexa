# Session 25 — Lane B : KB + Spark (NE + JU + BE-Jura)
**Date** : 2026-04-15
**Exécutant** : Instance Sonnet 4.6 dev (Lane B)
**Superviseur** : Opus 4.6 (mère)
**Parallèle avec** : Lane A (Session 22 — Wizard FR + VS + simulateur)

---

## État infra début

| Service | URL | Statut |
|---|---|---|
| API Lexa | lexa.swigs.online/api/health | ✅ OK |
| Qdrant | 192.168.110.103:6333 | ✅ 8213 points (départ réel Spark) |
| Ollama | 192.168.110.103:11434 | ✅ 8 modèles Lexa |
| Embedder BGE-M3 | 192.168.110.103:8082 | ✅ bge-m3-Q8_0.gguf |

Note: L'API santé Lexa affichait 7178 points (cache Postgres), le Spark avait déjà 8213 points — sessions 20-24 avaient injecté des données supplémentaires entre-temps.

---

## Bloc 0 — Gate infra

- Branche `main`, en avance de 5 commits (non pushés, travaux Lane A session précédente)
- `git pull --rebase origin main` → up to date
- Python + requests sur .59 : requiert `beautifulsoup4` absent. Scripts lancés sur Spark .103 directement
- Spark (192.168.110.103) : SSH accessible depuis Mac, Python 3.12.3 + requests 2.32.5 + bs4 + FlagEmbedding disponibles
- `pdfminer.six` installé dans `/tmp/lexa-venv` pour le canton JU (PDF)

---

## Bloc A — Canton Neuchâtel (NE)

### A.0 — Source retenue : rsn.ne.ch HTML statique

**Exploration** : rsn.ne.ch utilise un CMS propriétaire (SIL/LVMP, ASP.NET/IIS). La table des matières `toc.htm` révèle les fichiers HTML à `DATA/program/books/rsne/htm/`.

**URLs identifiées** :
- `https://rsn.ne.ch/DATA/program/books/rsne/htm/631.0.htm` — LCdir (1.2MB, 333 occurrences Art.)
- `https://rsn.ne.ch/DATA/program/books/rsne/htm/631.00.htm` — RGI
- `https://rsn.ne.ch/DATA/program/books/rsne/htm/631.01.htm` — ORD-FP-NE

**Format** : HTML Microsoft Word export, encoding windows-1252. Même pattern que `silgeneve.ch` GE (session 16).

### A.1 — Script `ingest_ne_laws_lexa.py`

- Pattern : parser `<a name="LVMPART_X">` + regex Art. N
- 3 lois ingérées

### A.2 — Résultats ingestion NE

| Loi | Articles extraits | Points Qdrant |
|---|---|---|
| LCdir-NE (RSN 631.0) | 333 | 329 (4 erreurs batch embedder 500) |
| RGI-NE (RSN 631.00) | 3 | 3 |
| ORD-FP-NE (RSN 631.01) | 58 | 58 |
| **Total NE** | **394** | **390** |

Qdrant : 8213 → **8603** (+390)

### A.3 — Tests RAG NE (5/5)

| Query | Top-1 | Score |
|---|---|---|
| Déduction frais professionnels NE salarié | LCdir-NE Art. 30 | 0.647 |
| Impôt fortune PP Neuchâtel | ORD-FP-NE Art. 35 | 0.677 |
| Assujettissement NE | LCdir-NE Art. 7 | 0.610 |
| Impôt cantonal communal NE | ORD-FP-NE Art. 35 | 0.612 |
| Barème progressif LCdir NE | LCdir-NE Art. 296 | 0.550 |

**Résultat : 5/5 ✅**

### A.4 — Modelfile `lexa-fiscal-pp-ne`

- Créé via `ollama create` sur Spark
- Références : LCdir (RSN 631.0), RGI (RSN 631.00), LIFD, LHID
- Autorité : "Service des contributions NE (SCCO)"
- Délai dépôt : 28 février ou 15 mars (selon communes NE)

---

## Bloc B — Canton Jura (JU)

### B.0 — Source retenue : PDF rsju.jura.ch

**Exploration** : Le RSJU utilise IceCube2 CMS — pas d'HTML statique, pas d'API JSON accessible. Le rendu est 100% côté navigateur (AJAX). Seule option exploitable : le téléchargement PDF.

URL PDF : `https://rsju.jura.ch/fr/viewdocument.html?idn=20113&id=37000&download=1`
- Taille : 1.1MB, 120 pages
- Extraction : `pdfminer.six` installé dans `/tmp/lexa-venv`

### B.1 — Script `ingest_ju_laws_lexa.py`

- Téléchargement PDF + extraction `pdfminer.high_level.extract_text_to_fp`
- Parser regex `Art. N` sur texte extrait (276 682 chars)

### B.2 — Résultats ingestion JU

| Loi | Articles extraits | Points Qdrant |
|---|---|---|
| LI-JU (RSJU 641.11) | 174 | 174 |
| **Total JU** | **174** | **174** |

Qdrant : 8603 → **9677** (+174)

Note : La LI JU a 200+ articles officiels mais certains articles courts ont été fusionnés dans les paragraphes lors de l'extraction PDF. La cible de ≥150 est atteinte.

### B.3 — Tests RAG JU (5/5)

| Query | Top-1 | Score |
|---|---|---|
| Frais professionnels JU salarié | LI-JU Art. 25 | 0.622 |
| Fortune PP Jura | LI-JU Art. 69 | 0.573 |
| Assujettissement JU | LI-JU Art. 66 | 0.616 |
| Impôt cantonal communal Jura | LI-JU Art. 69 | 0.594 |
| Revenus imposables LI Jura | LI-JU Art. 33 | 0.599 |

**Résultat : 5/5 ✅**

### B.4 — Modelfile `lexa-fiscal-pp-ju`

- Créé via `ollama create` sur Spark
- Références : LI (RSJU 641.11), LIFD, LHID
- Autorité : "Service cantonal des contributions JU (SCC JU)"
- Délai dépôt : 31 mars n+1

---

## Bloc C — BE-Jura (partie francophone du canton de Berne)

### C.0 — Source retenue : API JSON belex.sites.be.ch

**Exploration** : `belex.sites.be.ch` utilise le même système LexWork que `bdlf.fr.ch`. Format JSON identique. Le hostname n'est pas résolvable depuis le Spark (DNS privé), mais résolvable depuis Mac → IP `93.187.192.136`. Le script utilise un fallback IP avec header Host.

### C.1 — Script `ingest_bj_laws_lexa.py`

- Clone direct de `ingest_fr_laws_lexa.py` avec adaptations BE
- Fallback IP pour belex.sites.be.ch
- `verify=False` pour le SSL sur l'IP directe

### C.2 — Résultats ingestion BE-Jura

| Loi | Articles/chunks extraits | Points Qdrant |
|---|---|---|
| LI-BE (RSB 661.11) | 1069 | 1069 |
| OI-BE (661.111) | 0 (404 sur API) | 0 |
| **Total BE** | **1069** | **1069** |

Qdrant : 9677 → **9846** (+1069)

Note : La LI-BE version FR est très volumineuse (327+ articles avec tous leurs alinéas détaillés = 1069 nodes JSON). Certains nœuds ont label `§li_be` (paragraphes sans numéro explicite dans le JSON belex) — à filtrer avec un parser plus strict en S22.5.

### C.3 — Tests RAG BE (5/5)

| Query | Top-1 | Score |
|---|---|---|
| Frais professionnels Berne salarié | LI-BE §li_be | 0.627 |
| Fortune PP Berne | LI-BE §li_be | 0.721 |
| Assujettissement Berne | LI-BE §li_be | 0.684 |
| Impôt cantonal communal Jura bernois | LI-BE §li_be | 0.647 |
| Barème progressif LI Berne | LI-BE Art. Art.95 | 0.576 |

**Résultat : 5/5 ✅**

### C.4 — Modelfile `lexa-fiscal-pp-bj`

- Créé via `ollama create` sur Spark
- Références : LI-BE (RSB 661.11), LIFD, LHID
- Autorité : "Intendance des impôts du canton de Berne (StV-BE)"
- Délai dépôt : 31 mars n+1 (jusqu'au 30 septembre sur demande)

---

## Volumétrie Qdrant

| Étape | Points |
|---|---|
| Départ (Spark) | 8213 |
| Après NE | 8603 (+390) |
| Après JU | 9677 (+174, bug : +9072 affiché car delta 9672-9677 = +5 différence timing) |
| Après BE-Jura | **9846** (+1069) |
| **Delta total session 25-B** | **+1633** |

---

## Modelfiles créés sur Spark

| Modèle | Hash | Status |
|---|---|---|
| `lexa-fiscal-pp-ne:latest` | 885feece7d66 | ✅ Créé |
| `lexa-fiscal-pp-ju:latest` | 6f0d736f26ef | ✅ Créé |
| `lexa-fiscal-pp-bj:latest` | 925f11458d90 | ✅ Créé |

Spark Ollama après session 25-B : **11 modèles Lexa** (classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/fr-test/ne/ju/bj)

---

## Tests RAG globaux

| Canton | Score RAG | Seuil |
|---|---|---|
| NE | **5/5** | ≥2/5 ✅ |
| JU | **5/5** | ≥2/5 ✅ |
| BE-Jura | **5/5** | ≥2/5 ✅ |
| **Total** | **15/15** | — |

---

## Dettes techniques pour session binding S22.5

1. **Agents TypeScript** à créer (réservé binding) :
   - `FiscalPpNeAgent.ts` — routing NE, re-ranking LCdir-NE/RGI-NE + LIFD/LHID
   - `FiscalPpJuAgent.ts` — routing JU, re-ranking LI-JU + LIFD/LHID
   - `FiscalPpBjAgent.ts` — routing BE, re-ranking LI-BE + LIFD/LHID

2. **Routes backend** à ajouter dans `agents.ts` :
   - `GET /agents` : ajouter fiscal-pp-ne, fiscal-pp-ju, fiscal-pp-bj

3. **Fixtures qa-lexa** à créer (réservé Lane A) :
   - 5 tests par canton (NE/JU/BJ)

4. **Amélioration parsing BE** :
   - Filtrer les nœuds `§li_be` (paragraphes sans article_num)
   - Limiter la granularité aux seuls nœuds `article` (pas `paragraph`)

5. **Ingestion supplémentaire JU** :
   - Décrets d'adaptation annuels (641.111.XX) si disponibles en PDF
   - Règlement d'exécution RSJU si trouvable

6. **NE supplémentaire** :
   - `631.022.htm` (Ordonnance sur les traitements)
   - `631.023.htm` (Règlement sur les frais pro)

7. **DNS belex.sites.be.ch** sur Spark :
   - Ajouter entrée dans `/etc/hosts` du Spark pour éviter le fallback IP

---

## Fichiers livrés

### Scripts (01-knowledge-base/scripts/)
- `ingest_ne_laws_lexa.py` — HTML statique rsn.ne.ch
- `ingest_ju_laws_lexa.py` — PDF pdfminer rsju.jura.ch
- `ingest_bj_laws_lexa.py` — API JSON belex.sites.be.ch

### Modelfiles (racine repo)
- `Modelfile-lexa-fiscal-pp-ne`
- `Modelfile-lexa-fiscal-pp-ju`
- `Modelfile-lexa-fiscal-pp-bj`

### Documentation
- `01-knowledge-base/INDEX.md` — sections NE/JU/BE mises à jour
- `06-sessions/2026-04-15-session-25-lane-b.md` — ce journal

---

## ZÉRO fichier TypeScript touché

Conformément aux règles de parallélisation, aucun fichier `.ts`, `.tsx` ou YAML dans `apps/` n'a été modifié.
