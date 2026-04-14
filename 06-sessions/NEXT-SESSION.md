# NEXT SESSION — Point de reprise

**Dernière session** : [Session 04 — 2026-04-14](2026-04-14-session-04.md)
**Prochaine session** : Session 05

> **Lecture obligatoire au début de la prochaine session.** Ce fichier est écrasé à chaque fin de session.

---

## Où on en est

**Phase** : 0 — Fondations documentaires, **KB fédérale quasi-complète**

**Progrès cumulés sessions 01-04** :

| Session | Livrables clés | Qdrant |
|---|---|---|
| 01 | Whitepaper, archi, roadmap, KB index | 791 |
| 02 | Git init + push, LHID ingérée, décisions user | 899 |
| 03 | 15 docs AFC + 4 docs VS (Notice A, 14 Circ IFD, Guide PP, barème 2026...) | 3007 |
| 04 | **LP + CSI 28 + Loi fiscale VS** (via Playwright) | **4058** |

**Collection Qdrant `swiss_law` : 4058 points**

**KB fédérale : 5/5 lois clés ingérées** (LIFD, LTVA, LHID, CO, LP) + 14 circulaires IFD + Notice A 1995 + CSI Circulaire 28 + commentaire.

**KB cantonale Valais** : Loi fiscale (175 articles) + Guide PP 2024 + barème 2026 + déductions forfaitaires + directives impôt source. **Premier canton SR couvert.**

**Aucun code applicatif écrit.** Backend et frontend Lexa pas encore commencés. La KB avance nettement plus vite que prévu dans la roadmap initiale.

---

## Infrastructure

| Machine | Rôle | Status |
|---|---|---|
| **DGX Spark** 192.168.110.103 | Qdrant (4058 pts) + Ollama + BGE-M3 + Playwright/Chromium + scripts | ✅ Actif |
| **Serveur .59** 192.168.110.59 | Backend Lexa futur (port 3010) | ⚠️ **Postgres toujours pas installé (password refusé)** |
| **Mac local** | Dev docs + git | ✅ Actif |
| **GitHub** [swigsstaking/lexa](https://github.com/swigsstaking/lexa) | Source control | ✅ Actif |

**Performance BGE-M3 sur Spark** : en CPU uniquement (torch+CUDA indispo aarch64). ~1.25 chunks/s. Pour ingestions moyennes (200-500 chunks) : 3-8 min. Pour grosses (1500+) : 20-25 min. **Pas bloquant mais à budgéter**.

---

## Ce qu'il faut lire AVANT de démarrer la session 05

1. **`06-sessions/2026-04-14-session-04.md`** — journal session 04 (15 min) — **essentiel**
2. **`01-knowledge-base/INDEX.md`** — statut global KB (5 min)
3. **`01-knowledge-base/federal/circulaires-afc-index.md`** — documents AFC + statut (5 min)

**Total : ~25 min**

---

## Questions en attente de réponse du user

⚠️ **6 questions à trancher en début de session 05** :

1. **Postgres sur .59** — Le password `Labo 2-6` testé (avec espace) a été refusé par sudo (`Sorry, try again`). **Peux-tu confirmer l'orthographe exacte ?** (Labo2-6 sans espace ? lowercase ? autre variante ?) Ou préfères-tu lancer toi-même l'install ?

2. **Info TVA webpublications** — Portail JSF `gate.estv.admin.ch` en allemand par défaut, navigation par session, complexe à scraper. Options :
   - (a) Scraper Playwright avec click section par section (3-4h, fragile)
   - (b) PDFs historiques 2010 kmu.admin.ch (FR, mais obsolètes — avant changement taux 2024)
   - (c) Skip temporairement pour v1
   - *Reco Claude : (c) — on a déjà LTVA + circulaires, les Info TVA peuvent attendre*

3. **OIFD + OLTVA** — on déléguer à un subagent pour trouver les vraies URLs XML Fedlex (30 min investigation) ?
   - *Reco Claude : oui, c'est important pour l'agent Fiscal d'avoir les ordonnances d'exécution*

4. **Amélioration parser VS Loi fiscale** — actuellement 175/285 articles extraits (61% couverture). On affine (1-2h) ou on accepte ?
   - *Reco Claude : affiner — les articles manquants sont probablement les articles avec numérotation inhabituelle (5a, 6a) et les articles avec heading sur la même ligne. Debug rapide*

5. **Canton 2 — Genève** — on démarre session 05 ou on attend ?
   - *Reco Claude : session 05 si on finit vite les 3 premières tâches, sinon session 06*

6. **Session backend** — ma reco session 04 : **session 06 = scaffold backend** (event store Postgres + premier agent TypeScript). OK ou on retarde ?
   - *Reco Claude : session 06 si Postgres est installé d'ici là, sinon on pousse à session 07*

---

## Plan détaillé de la session 05 (si recommandations Claude acceptées)

### Étape 1 — Postgres (5 min si password correct)

```bash
ssh swigs@192.168.110.59
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable postgresql && sudo systemctl start postgresql
sudo -u postgres createdb lexa
sudo -u postgres psql -c "CREATE USER lexa_app WITH PASSWORD '<strong-random-pwd>'"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE lexa TO lexa_app"
```

Password généré côté Claude, stocké dans un `.env` local non-commit.

### Étape 2 — OIFD + OLTVA via subagent (45 min)

Déléguer à un subagent : trouver les URLs XML Fedlex canoniques pour :
- OIFD (RS 642.116) — Ordonnance sur l'impôt fédéral direct
- OLTVA (RS 641.201) — Ordonnance sur la TVA
- Bonus si rapide : OIA (642.21) — Ordonnance sur l'impôt anticipé

Puis créer `ingest_oifd_lexa.py` + `ingest_oltva_lexa.py` (clones de LHID).

### Étape 3 — Amélioration parser VS Loi fiscale (1-2h)

Debug du regex de parsing :
- Détecter les articles avec numéro + titre sur la même ligne
- Gérer les articles supplémentaires (5a, 6a, etc.)
- Gérer les articles abrogés (marqueurs "* ...")
- Re-exécuter l'ingestion (le cache `vs_loi_fiscale_642.1.txt` existe déjà — pas besoin de re-scraper)

Si amélioration donne 250+ articles, re-upsert dans Qdrant (upsert = update pour les UUIDs déjà là, mais comme on utilise `str(uuid.uuid4())` chaque fois, ça crée des nouveaux points — il faut soit gérer l'upsert par article_num, soit delete le subset VS-Loi-fiscale avant re-upsert).

### Étape 4 — Canton 2 : Genève (2-3h si temps restant)

Scraper Playwright sur lexfind.ch ou ge.ch pour :
- LCP — Loi générale sur les contributions publiques
- LIPP — Loi sur l'imposition des personnes physiques
- LIPM — Loi sur l'imposition des personnes morales

Créer `ingest_ge_laws_lexa.py` avec pattern similaire à `ingest_vs_loi_fiscale_lexa.py`.

### Étape 5 — Journal + commit + push (30 min)

---

## État actuel de la collection Qdrant `swiss_law`

**4058 points total**

### Fédéral (lois) ✅ 100% des lois clés
- **LTVA (641.20)** : 131 articles — Fedlex XML
- **LIFD (642.11)** : 224 articles — Fedlex XML
- **CO (220)** : 421 articles — Fedlex XML (titres 30-32 + SA/Sàrl/Société simple)
- **LHID (642.14)** : 108 articles — Fedlex XML
- **LP (281.1)** : 397 articles — Fedlex XML *(session 04)*

### Fédéral (administratif AFC/IFD)
- Notice A 1995 entreprises commerciales : ~16 chunks
- 14 circulaires IFD (Circ 3, 5a, 6a, 15, 18a, 25, 26, 29c, 32a, 37, 44, 45, 49, 50a) : ~1864 chunks

### Fédéral (CSI) ✅ *session 04*
- CSI Circulaire 28 2022 : ~300 chunks
- CSI Circulaire 28 Commentaire 2023 : ~179 chunks

### Cantonal Valais ✅ premier canton SR
- **Loi fiscale (RSVS 642.1)** : 175 articles *(session 04, via Playwright)*
- Guide déclaration PP 2024 : 169 chunks
- Barème 2026 : 5 chunks
- Déductions forfaitaires 2025 : 14 chunks
- Directives impôt source 2025 : 40 chunks

### Manquant (priorité session 05+)
- **OIFD** (642.116) et **OLTVA** (641.201) — ordonnances d'exécution
- **Info TVA webpublications** (Info TVA 12 TDFN, Info TVA 15 Décompte, Info TVA secteur 17 Immeubles) — JSF complexe
- **Règlement d'exécution de la loi fiscale VS** (RELF)
- **Autres cantons SR** : GE, VD, FR, NE, JU, BE-Jura
- **Standards techniques** : eCH-0217, Swissdec, CAMT.053, QR-facture
- **Plan comptable Käfer** structuré (à extraire du system prompt)

---

## Scripts d'ingestion disponibles sur le Spark

| Script | Rôle | Destructif ? | Pattern |
|---|---|---|---|
| `~/ingest_swiss_law.py` | Parser Fedlex XML LTVA+LIFD+CO (session 01) | ⚠️ OUI (delete_collection) — **ne jamais relancer** | XML |
| `~/ollama-compta/scripts/ingest_laws_v2.py` | Articles hardcodés additifs (session 01) | ❌ Non | manuel |
| `~/ollama-compta/scripts/ingest_lhid_lexa.py` | LHID (session 02) | ❌ Non (UUID4) | XML |
| `~/ollama-compta/scripts/ingest_afc_pdfs_lexa.py` | Notice A + 14 circulaires IFD (session 03) | ❌ Non (UUID4) | PDF (pymupdf) |
| `~/ollama-compta/scripts/ingest_vs_pdfs_lexa.py` | 4 PDFs fiscaux Valais (session 03) | ❌ Non (UUID4) | PDF |
| `~/ollama-compta/scripts/ingest_lp_lexa.py` | LP (session 04) | ❌ Non (UUID4) | XML |
| `~/ollama-compta/scripts/ingest_csi_lexa.py` | CSI Circ 28 + commentaire (session 04) | ❌ Non (UUID4) | PDF |
| `~/ollama-compta/scripts/ingest_vs_loi_fiscale_lexa.py` | Loi fiscale VS (session 04) | ❌ Non (UUID4) | **HTML via Playwright** |

**Règle absolue** : tout nouveau script d'ingestion Lexa doit suivre `ingest_*_lexa.py` (upsert UUID4 pur).

**Stack Python sur le Spark** (`~/.local/lib/python3.12/site-packages/`) :
- `FlagEmbedding`, `qdrant-client`, `requests`, `pdfplumber`, `pymupdf` (fitz), `playwright`, `packaging`, `yaml`, `tqdm`, `huggingface_hub`
- BGE-M3 : `use_fp16=True`, `device="cuda"` mais fallback silencieux en CPU
- Chromium headless : `~/.cache/ms-playwright/chromium_headless_shell-1208/`
- PEP 668 bypassé via `--break-system-packages`

---

## Pattern Playwright (validé session 04)

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 900},
    )
    page = context.new_page()
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(3000)  # Cloudflare clear + JS render
    body_text = page.evaluate("() => document.body.innerText")
    browser.close()
```

**Cloudflare bypass** : headless Chromium + UA standard suffit. Pas besoin de plugins stealth.

**Pour les portails JSF (PrimeFaces)** : plus complexe, il faut simuler des clicks + gérer `ViewState`. À explorer session 05.

---

## Modèles sur le DGX Spark (rappel)

| Modèle | Taille | Usage prévu |
|---|---|---|
| `comptable-suisse` | 29 GB (Q8) | Agents fiscal (TVA, PP, PM, Clôture), batch |
| `comptable-suisse-fast` | 17 GB (Q4) | Classifier, chat interactif |
| `qwen3-vl-ocr` | 6.1 GB | OCR principal (factures) |
| `deepseek-ocr` | 6.7 GB | OCR fallback |
| `qwen3-vl:8b` | 6.1 GB | Vision générale |
| `qwen3.5:9b-optimized` | 10 GB | Tâches légères |
| BGE-M3 | ~2 GB | Embeddings RAG multilingue (CPU) |

Ollama config : `OLLAMA_FLASH_ATTENTION=1`, `KEEP_ALIVE=-1`, KV cache Q4.

---

## Avertissements importants

1. **Ne jamais toucher aux 3 processus Ollama actifs sur le Spark** — prod autres projets.
2. **Ne pas supprimer le prototype `~/ollama-compta/`** — utilisé pour consulting.
3. **Ne jamais relancer `~/ingest_swiss_law.py`** — destructif (delete_collection).
4. **Toujours UUID4** pour les nouveaux scripts d'ingestion Lexa.
5. **BGE-M3 est sur CPU** — prévoir du temps pour les grosses ingestions.
6. **Playwright + Chromium sont installés** sur le Spark, prêts à l'emploi.
7. **Pas de secrets dans le repo** — `.env` git-ignoré.
8. **Le sudo password partagé dans le chat session 04 n'a pas fonctionné** — demander au user de confirmer la bonne forme ou de lancer lui-même l'install Postgres.

---

## Configuration serveur backend Lexa (à venir)

- **Hôte** : swigs@192.168.110.59 (sw6c-1)
- **Port** : 3010
- **Path install** : `/home/swigs/lexa-backend/`
- **PM2 name** : `lexa-backend`
- **Stack** : Node 20.19, TypeScript, Express, pg, mongoose, ioredis
- **Postgres** : **TOUJOURS PAS INSTALLÉ** — pending user sudo

---

**Dernière mise à jour** : 2026-04-14 (fin session 04)
