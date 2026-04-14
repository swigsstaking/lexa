# NEXT SESSION — Point de reprise

**Dernière session** : [Session 03 — 2026-04-14](2026-04-14-session-03.md)
**Prochaine session** : Session 04

> **Lecture obligatoire au début de la prochaine session.** Ce fichier est écrasé à chaque fin de session.

---

## Où on en est

**Phase** : 0 — Fondations documentaires + enrichissement KB fédérale et cantonale (avance rapide)

**Progrès sessions 01-03** :
- ✅ Whitepaper v0.1, architecture, agent system, roadmap, KB index (session 01)
- ✅ 7 questions stratégiques tranchées (session 02)
- ✅ Repo Git initialisé et poussé sur **github.com/swigsstaking/lexa**
- ✅ Infrastructure backend cadrée (serveur .59, port 3010, Postgres à installer)
- ✅ LHID ingérée (108 articles, session 02)
- ✅ **15 documents AFC ingérés** (Notice A 1995 + 14 circulaires IFD) = 1880 chunks (session 03)
- ✅ **4 documents Valais ingérés** (Guide PP 2024, barème 2026, déductions, impôt source) = 228 chunks (session 03)
- ✅ Catalogue AFC complet dans `01-knowledge-base/federal/circulaires-afc-index.md`

**Collection Qdrant `swiss_law` : 3007 points**

**Aucun code applicatif encore écrit.** Le backend et le frontend Lexa n'existent toujours pas. On est en phase d'enrichissement KB, qui avance plus vite que prévu.

---

## Infrastructure

| Machine | Rôle | Status |
|---|---|---|
| **DGX Spark** 192.168.110.103 | Qdrant (3007 pts) + Ollama + BGE-M3 (CPU) + scripts Python | ✅ Actif |
| **Serveur .59** 192.168.110.59 | Backend Lexa futur (port 3010) | ⚠️ **Postgres toujours à installer (bloqué sudo)** |
| **Mac local** | Dev docs + git | ✅ Actif |
| **GitHub** [swigsstaking/lexa](https://github.com/swigsstaking/lexa) | Source control | ✅ Actif |

**À noter** : BGE-M3 tourne en CPU sur le Spark (torch+CUDA indispo sur aarch64). Ingestion 1880 chunks = ~22 min. Les futures grosses ingestions (7 cantons × ~500 chunks) prendront ~1.5h à 2h chacune. Pas bloquant mais à planifier.

---

## Ce qu'il faut lire AVANT de démarrer la session 04

Dans cet ordre :

1. **`06-sessions/2026-04-14-session-03.md`** — journal complet (15 min) — **essentiel**
2. **`01-knowledge-base/INDEX.md`** — statut KB global (5 min)
3. **`01-knowledge-base/federal/circulaires-afc-index.md`** — ce qui est ingéré et ce qui reste (5 min)

**Total : ~25 min**

Les docs de fond (whitepaper, architecture, roadmap) n'ont pas changé — pas besoin de les relire.

---

## Questions en attente de réponse du user

⚠️ **7 questions à trancher en début de session 04** :

1. **Postgres sur .59** — Tu lances toi-même (besoin sudo), ou on défère en T2 2026 ?
   ```bash
   sudo apt-get update && sudo apt-get install -y postgresql-16 postgresql-contrib-16
   sudo systemctl enable postgresql && sudo systemctl start postgresql
   ```
   *Reco Claude : défer en T2 2026, on a encore plein de KB à faire avant le code*

2. **Scraper HTML pour les Info TVA webpublications** — On investit en session 04 ? BeautifulSoup + requests, ~1-2h.
   *Reco Claude : oui, les Info TVA sont critiques pour la compta TVA quotidienne*

3. **Loi fiscale VS complète via Playwright** — Contourner Cloudflare de lex.vs.ch. Install Playwright + Chrome headless (~100 MB). OK ?
   *Reco Claude : oui, c'est le document cantonal VS le plus important*

4. **LP (281.1)** — Session 04 ou plus tard ?
   *Reco Claude : session 04, c'est rapide (pattern XML AkomaNtoso similaire à LHID)*

5. **CSI Circulaire 28** (estimation titres non cotés) — Session 04 ?
   *Reco Claude : oui, c'est le doc de référence pour les SA/Sàrl non cotées*

6. **OIFD + OLTVA** (ordonnances d'exécution) — Priorité ?
   *Reco Claude : session 05 (après Info TVA + Circ 28)*

7. **Accélération roadmap** — La KB avance plus vite que prévu. On démarre le scaffold backend en session 05 ou 06 ? On raccourcit la phase KB ?
   *Reco Claude : finir proprement la couverture fédérale + cantonale VS en sessions 04-06, puis attaquer le backend session 07*

---

## Plan détaillé de la session 04 (si recommandations Claude acceptées)

### Étape 1 — LP (RS 281.1) (30 min)

Pattern LHID : télécharger XML Fedlex + adapter le script `ingest_lhid_lexa.py`.

```bash
# Trouver l'URL LHID pattern — essayer xml-1 à xml-10
ssh swigs@192.168.110.103 'for n in 1 2 3 4 5 6 7 8 9 10; do url="https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/11/529_488_529/20250101/fr/xml/fedlex-data-admin-ch-eli-cc-11-529_488_529-20250101-fr-xml-${n}.xml"; code=$(curl -s -o /dev/null -w "%{http_code}" "$url"); echo "xml-${n}: HTTP $code"; if [ "$code" = "200" ]; then echo "FOUND"; break; fi; done'
```

(ELI path LP à vérifier — 281.1 publié en 1889, mais consolidation date de 1992 : `/cc/11/529_488_529/`)

Puis copier `ingest_lhid_lexa.py` → `ingest_lp_lexa.py`, remplacer les métadonnées, lancer.

### Étape 2 — Scraper HTML Info TVA webpublications (1-2h)

Créer `ingest_afc_webpublications_lexa.py` :

1. Télécharger chaque page HTML depuis `gate.estv.admin.ch/mwst-webpublikationen/public/pages/taxInfos/...`
2. Parser avec BeautifulSoup — chaque section HTML devient un chunk
3. Métadonnées : `law: "AFC-Info-TVA-12"`, `category: "info-tva-webpub"`, `source: "afc-gate"`
4. Upsert Qdrant UUID4

URLs cibles :
- Info TVA 12 TDFN : publicationId `1004992`
- Info TVA 15 Décompte : publicationId `1013189`
- Info TVA secteur 17 Immeubles : publicationId `1041941`
- Info TVA secteur 04 Bâtiment : publicationId `1000849`

### Étape 3 — CSI Circulaire 28 (15 min)

Télécharger les 2 PDFs :
- https://www.ssk-csi.ch/fileadmin/dokumente/kreisschreiben/KS_28_f_2022.pdf
- https://www.ssk-csi.ch/fileadmin/dokumente/kreisschreiben/KS_28_Kommentar_f_2023.pdf

Ajouter à `ingest_afc_pdfs_lexa.py` ou créer `ingest_csi_lexa.py` dédié. Le 2ème est plus propre.

### Étape 4 — Loi fiscale VS via Playwright (1-2h)

Install Playwright + Chromium sur le Spark (~100 MB) :

```bash
ssh swigs@192.168.110.103
pip install --user --break-system-packages playwright
python3 -m playwright install chromium --with-deps  # ~100 MB
```

Puis créer `ingest_vs_loi_fiscale_lexa.py` :
1. Playwright ouvre `https://lex.vs.ch/app/fr/texts_of_law/642.1`
2. Attend que la page rende (Cloudflare clear)
3. Extrait le HTML structuré
4. Parse les articles
5. Upsert Qdrant avec `jurisdiction: "cantonal-VS"`, `topic: "loi_fiscale_vs"`

Si Playwright est trop lourd, alternative : utiliser un User-Agent + cookies valides capturés manuellement. Moins fiable.

### Étape 5 — Journal + commit + push (30 min)

---

## État actuel de la collection Qdrant `swiss_law`

**3007 points total**

### Session 01 (791 points)
- LTVA (641.20) : 131 articles XML Fedlex
- LIFD (642.11) : 224 articles XML Fedlex
- CO (220) : 421 articles XML Fedlex (titres 30-32 + parties SA/Sàrl/Société simple)
- Articles enrichis manuels : 15 résumés

### Session 02 (+108 → 899)
- LHID (642.14) : 108 articles XML Fedlex (script `ingest_lhid_lexa.py`)

### Session 03 (+2108 → 3007)

**Fédéral AFC (+1880)** :
- AFC-Notice-A-1995-entreprises-commerciales : 16 chunks
- AFC-IFD-Circ-3 Sylviculture/Agriculture : 45 chunks
- AFC-IFD-Circ-5a Restructurations : ~500 chunks (circulaire très volumineuse)
- AFC-IFD-Circ-6a Capital propre dissimulé : ~50 chunks
- AFC-IFD-Circ-15 Obligations/Dérivés : 110 chunks
- AFC-IFD-Circ-18a Pilier 3a : ~50 chunks
- AFC-IFD-Circ-25 Placements collectifs : 83 chunks
- AFC-IFD-Circ-26 Activité indépendante : ~130 chunks
- AFC-IFD-Circ-29c Apport de capital : ~30 chunks
- AFC-IFD-Circ-32a Assainissement : ~50 chunks
- AFC-IFD-Circ-37 Participations collaborateurs : 137 chunks
- AFC-IFD-Circ-44 Imposition dépense : 47 chunks
- AFC-IFD-Circ-45 Impôt à la source : 296 chunks
- AFC-IFD-Circ-49 Étranger-étranger : ~100 chunks
- AFC-IFD-Circ-50a Commissions occultes : ~40 chunks

**Cantonal VS (+228)** :
- VS-Guide-declaration-2024 : 169 chunks
- VS-Bareme-2026 : 5 chunks
- VS-Deductions-forfaitaires-2025 : 14 chunks
- VS-Directives-impot-source-2025 : 40 chunks

### Manquant (priorité session 04+)
- LP (281.1) — XML Fedlex facile (30 min)
- OIFD + OLTVA — XML Fedlex faciles
- Info TVA webpublications — HTML scraping (1-2h)
- CSI Circulaire 28 + commentaire — PDFs (15 min)
- **Loi fiscale VS complète** — Playwright + Cloudflare (1-2h)
- Règlement d'exécution VS (RELF)
- Autres cantons SR (GE, VD, FR, NE, JU, BE-Jura)
- Standards techniques (eCH-0217, Swissdec, CAMT.053, QR)

---

## Scripts d'ingestion disponibles sur le Spark

| Script | Rôle | Destructif ? | Pattern |
|---|---|---|---|
| `~/ingest_swiss_law.py` | Parser Fedlex XML (LTVA + LIFD + CO) | ⚠️ **OUI** (delete_collection) — **ne pas relancer** | XML |
| `~/ollama-compta/scripts/ingest_laws_v2.py` | Articles hardcodés additifs | ❌ Non | manuel |
| `~/ollama-compta/scripts/ingest_lhid_lexa.py` | LHID uniquement | ❌ Non (UUID4) | XML |
| `~/ollama-compta/scripts/ingest_afc_pdfs_lexa.py` | Notice A + 14 circulaires IFD | ❌ Non (UUID4) | PDF |
| `~/ollama-compta/scripts/ingest_vs_pdfs_lexa.py` | 4 documents fiscaux Valais | ❌ Non (UUID4) | PDF |

**Règle absolue** : tout nouveau script d'ingestion Lexa doit suivre `ingest_*_lexa.py` (upsert UUID4 pur).

**Stack Python sur le Spark** :
- Python 3.12 system + `~/.local/lib/python3.12/site-packages/`
- Packages : `FlagEmbedding`, `qdrant-client`, `requests`, `pdfplumber`, `pymupdf` (fitz), `packaging`, `yaml`, `tqdm`, `huggingface_hub`
- BGE-M3 : `use_fp16=True`, `device="cuda"` (mais fallback silencieux en CPU car torch+CUDA indispo aarch64)
- PEP 668 bypassé via `--break-system-packages`

---

## Modèles sur le DGX Spark (rappel)

| Modèle | Taille | Usage prévu dans Lexa |
|---|---|---|
| `comptable-suisse` | 29 GB (Q8) | Agents fiscal (TVA, PP, PM, Clôture), haute précision, batch |
| `comptable-suisse-fast` | 17 GB (Q4) | Agent Classifier, chat interactif, 11 tok/s |
| `qwen3-vl-ocr` | 6.1 GB | OCR principal (factures, reçus) |
| `deepseek-ocr` | 6.7 GB | OCR fallback |
| `qwen3-vl:8b` | 6.1 GB | Vision générale |
| `qwen3.5:9b-optimized` | 10 GB | Tâches légères, routage |
| BGE-M3 | ~2 GB | Embeddings RAG multilingue (CPU) |

Ollama config : `OLLAMA_FLASH_ATTENTION=1`, `KEEP_ALIVE=-1`, KV cache Q4.

---

## Avertissements importants (rappel)

1. **Ne jamais toucher aux 3 processus Ollama actifs sur le Spark** — ils servent à d'autres projets en prod.
2. **Ne pas supprimer le prototype `~/ollama-compta/`** — utilisé par le user pour du consulting.
3. **Ne jamais relancer `ingest_swiss_law.py`** — il détruit la collection.
4. **Toujours UUID4** pour les nouveaux scripts Lexa.
5. **BGE-M3 est sur CPU** — prévoir du temps pour les grosses ingestions.
6. **Playwright/Chromium** sera nécessaire pour `lex.vs.ch` (Cloudflare).
7. **Pas de secrets dans le repo** — `.env` git-ignoré.

---

## Configuration serveur backend Lexa (à venir)

- **Hôte** : swigs@192.168.110.59 (sw6c-1)
- **Port** : 3010
- **Path install** : `/home/swigs/lexa-backend/`
- **PM2 name** : `lexa-backend`
- **Stack** : Node 20.19, TypeScript, Express, pg, mongoose, ioredis
- **Postgres** : **TOUJOURS PAS INSTALLÉ** — pending user sudo

---

**Dernière mise à jour** : 2026-04-14 (fin session 03)
