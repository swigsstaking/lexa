# NEXT SESSION — Point de reprise

**Dernière session** : [Session 01 — 2026-04-13](2026-04-13-session-01.md)
**Prochaine session** : Session 02

> **Lecture obligatoire au début de la prochaine session.** Ce fichier est écrasé et remis à jour à chaque fin de session. Il contient exactement ce qu'il faut savoir pour reprendre sans friction.

---

## Où on en est

**Phase** : 0 — Fondations documentaires

**Statut global** : Le projet **Lexa** est lancé. Arborescence créée, whitepaper v0.1 écrit, architecture 5 couches documentée, système multi-agents spécifié sur les modèles réels du DGX Spark, base de connaissances indexée, roadmap 24 mois posée.

**Aucun code encore écrit.** Le backend et le frontend Lexa n'existent pas. En revanche, un prototype avancé existe sur le DGX Spark (`~/ollama-compta/`) avec Qdrant + BGE-M3 + modèle `comptable-suisse` fine-tuné + 776 articles Fedlex + dataset 501 exemples + OCR service. **C'est notre fondation technique.**

---

## Ce qu'il faut lire AVANT de démarrer la session 02

Dans cet ordre :

1. **`README.md`** — vue d'ensemble du projet (5 min)
2. **`00-vision/north-star.md`** — la vision en 1 page (3 min)
3. **`00-vision/whitepaper.md`** — document maître v0.1 (15 min)
4. **`02-architecture/overview.md`** — architecture 5 couches (10 min)
5. **`02-architecture/agent-system.md`** — système multi-agents (10 min)
6. **`01-knowledge-base/INDEX.md`** — statut actuel de la base légale (5 min)
7. **`05-roadmap/milestones.md`** — roadmap 24 mois (5 min)
8. **`06-sessions/2026-04-13-session-01.md`** — journal complet de la session 01 (10 min)

**Total : ~1h de lecture pour reprendre en pleine conscience.**

---

## Questions en attente de réponse du user

⚠️ **Ces 7 questions doivent être tranchées au début de la session 02** avant toute action :

1. **Git** — Est-ce qu'on init un repo Git local dans `~/CascadeProjects/lexa/` dès maintenant ? Remote GitHub/GitLab privé ?
   - *Reco Claude : oui, repo privé dédié, .gitignore bien configuré*

2. **Fine-tuning LoRA** — Est-ce qu'on investit 1-2 jours à l'exécuter sur une machine x86, ou on reste sur system prompt + RAG (97% déjà) ?
   - *Reco Claude : skip fine-tuning pour l'instant, 97% suffit*

3. **Canvas library** — react-flow ou tldraw ? Je peux faire un benchmark concret en session 02.
   - *Reco Claude : benchmark en session 02*

4. **Premier canton à attaquer** — Genève (plus de ressources en ligne) ou Vaud (plus de fiduciaires) ?
   - *Reco Claude : Genève*

5. **Priorité session 02** — (a) KB legal, (b) Backend scaffold, (c) Canvas prototype, (d) Fine-tuning ?
   - *Reco Claude : (a) en premier, KB est le fondement*

6. **Expert fiduciaire** — Tu as quelqu'un en tête pour la validation externe ? À contacter quand ?
   - *Reco Claude : identifier en T1 2026, premier contact T2 2026*

7. **Swiss GAAP RPC** — On achète (~300-500 CHF) pour enrichir la KB, ou on s'en passe ?
   - *Reco Claude : à décider selon budget — peut attendre*

---

## Plan détaillé de la session 02 (si recommandations Claude acceptées)

### Étape 1 — Initialisation Git (15 min)

```bash
cd /Users/corentinflaction/CascadeProjects/lexa
git init
git add .
git commit -m "chore: initial documentation structure (session 01)"
# Puis créer repo privé sur GitHub et pousser
```

Créer `.gitignore` avec :
```
node_modules/
.env
.env.local
*.log
.DS_Store
/dist/
/build/
/coverage/
.vscode/
.idea/
```

### Étape 2 — Compléter `competitive-analysis.md` (30 min)

Analyse détaillée de chaque concurrent (Bexio, Abacus, Accounto, Banana, Run my Accounts) :
- Positionnement tarifaire
- Fonctionnalités clés
- Forces et faiblesses
- UX/UI
- Niveau d'IA
- Nos avantages différenciateurs

### Étape 3 — Ingestion LHID dans Qdrant (1h)

Sur le Spark :

```bash
ssh swigs@192.168.110.103

# Télécharger LHID XML depuis Fedlex
cd ~/ollama-compta/laws
wget "https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1991/1256_1256_1256/20250101/fr/xml/fedlex-data-admin-ch-eli-cc-1991-1256_1256_1256-20250101-fr-xml-N.xml" -O lhid_2025-01-01.xml

# Adapter ingest_laws_v2.py pour inclure LHID
# Lancer l'ingestion
python3 scripts/ingest_laws_v2.py --law LHID

# Vérifier que c'est bien dans Qdrant
python3 scripts/test_rag.py
```

Valider avec 3-4 requêtes LHID (ex : "principe d'harmonisation", "régime fiscal des fondations", "impôt sur la fortune").

### Étape 4 — Catalogue des circulaires AFC critiques (45 min)

Constituer un fichier `01-knowledge-base/federal/circulaires-afc-index.md` avec :
- Liste des circulaires AFC-TVA (Info TVA 01 à 30)
- Liste des circulaires AFC-IFD (Circulaires n° 1 à 50+)
- Notices (Notice A, Notice 1, etc.)
- Priorité d'ingestion
- URLs officielles

### Étape 5 — Journal de session + mise à jour NEXT-SESSION (15 min)

Créer `06-sessions/2026-MM-DD-session-02.md` et mettre à jour ce fichier.

---

## Plan alternatif (si priorité (b) backend scaffold retenue)

Au lieu des étapes 3-4 ci-dessus :

### Étape 3bis — Scaffold `lexa-backend` (2h)

```bash
cd ~/CascadeProjects
mkdir lexa-backend && cd lexa-backend
npm init -y
npm install express typescript tsx @types/node @types/express pg pg-promise mongoose
npm install -D nodemon eslint prettier
# tsconfig.json, src/ structure, migrations Postgres
```

Créer :
- `src/app.ts` (Express minimal)
- `src/db/postgres.ts` (connexion event store)
- `src/db/schema.sql` (migration initiale event store)
- `src/events/EventStore.ts` (classe write/read events)
- `src/routes/health.ts`

Tester localement que l'event store accepte un event et peut le relire.

---

## Commandes utiles à garder sous la main

```bash
# SSH DGX Spark
ssh swigs@192.168.110.103

# Liste des modèles Ollama dispo
ollama list

# Test RAG existant
cd ~/ollama-compta && python3 scripts/test_rag.py

# Status Qdrant
curl http://localhost:6333/collections/swiss_law

# Nombre de points dans la collection
curl http://localhost:6333/collections/swiss_law | jq '.result.points_count'

# Depuis macOS
cd /Users/corentinflaction/CascadeProjects/lexa
ls -la
```

---

## État des modèles DGX Spark (rappel)

| Modèle | Taille | Usage prévu dans Lexa |
|---|---|---|
| `comptable-suisse` | 29 GB (Q8) | Agents fiscal (TVA, PP, PM, Clôture), haute précision, batch |
| `comptable-suisse-fast` | 17 GB (Q4) | Agent Classifier, chat interactif, 11 tok/s |
| `qwen3-vl-ocr` | 6.1 GB | OCR principal (factures, reçus) |
| `deepseek-ocr` | 6.7 GB | OCR fallback |
| `qwen3.5:9b-optimized` | 10 GB | Tâches légères, routage |
| BGE-M3 | ~2 GB | Embeddings RAG multilingue |

**Ollama config** : `OLLAMA_FLASH_ATTENTION=1`, `KEEP_ALIVE=-1` (modèles permanents), KV cache Q4.

---

## État de la base de connaissances (rappel)

**Qdrant collection `swiss_law`** : 776 articles ingérés
- LTVA : 131 articles (RS 641.20, version 2025-01-01) ✅
- LIFD : 224 articles (RS 642.11, version 2025-01-01) ✅
- CO : 421 articles (RS 220, version 2025-10-01) ✅
- Notice A (amortissements) : partielle ⚠️
- Plan Käfer : dans system prompt, à extraire 🟡

**Manquant** (prioritaire) :
- LHID (642.14) ❌
- LP (281.1) ❌
- Circulaires AFC ❌
- Notices AFC complètes ❌
- Lois cantonales SR (7 cantons) ❌
- Règlements d'application cantonaux ❌
- Barèmes cantonaux ❌
- Formulaires officiels cantonaux ❌
- Standards techniques (eCH-0217, Swissdec, CAMT.053, QR) ❌

---

## Avertissements importants

1. **Ne jamais toucher aux 3 processus Ollama actifs** sur le Spark — ils servent à d'autres projets en prod. Utiliser seulement l'API Ollama (port 11434) sans redémarrer le daemon.

2. **Ne pas supprimer le prototype `~/ollama-compta/`** — il est utilisé par le user pour du consulting. Travailler en lecture ou en copie, pas en modification destructive.

3. **Respecter l'isolation cantonale** — ne pas mélanger les règles fiscales de plusieurs cantons dans le même namespace/topic Qdrant.

4. **Toujours citer la source** — règle absolue du modèle `comptable-suisse`. Si tu construis un nouvel agent, respecte la même discipline dans le system prompt.

5. **Pas de secrets dans le repo** — clés API, tokens, mots de passe → `.env` git-ignoré.

6. **Le fine-tuning est bloqué par aarch64** — ne pas perdre de temps à essayer sur le Spark directement. Utiliser une machine x86 (cloud GPU ou locale).

---

## Tâches en cours

Voir la task list Claude (TaskList) — toutes les tâches de session 01 sont marquées completed. Session 02 démarrera avec une nouvelle task list.

---

**Dernière mise à jour** : 2026-04-13 (fin session 01)
