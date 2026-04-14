# NEXT SESSION — Point de reprise

**Dernière session** : [Session 02 — 2026-04-14](2026-04-14-session-02.md)
**Prochaine session** : Session 03

> **Lecture obligatoire au début de la prochaine session.** Ce fichier est écrasé à chaque fin de session.

---

## Où on en est

**Phase** : 0 — Fondations documentaires + début enrichissement KB fédérale

**Progrès sessions 01-02** :
- ✅ Whitepaper v0.1, architecture, agent system, roadmap, KB index (session 01)
- ✅ 7 questions stratégiques tranchées (session 02)
- ✅ Repo Git initialisé et poussé sur **github.com/swigsstaking/lexa**
- ✅ Infrastructure backend cadrée (serveur .59, port 3010, Postgres à installer)
- ✅ **LHID ingérée** (108 articles) → collection Qdrant `swiss_law` à **899 points**
- ✅ **4/5 lois fédérales clés ingérées** (LIFD, LTVA, CO, LHID) — manque LP

**Aucun code applicatif encore écrit.** Le backend et le frontend Lexa n'existent toujours pas. On est en phase KB enrichment.

---

## Infrastructure utilisée

| Machine | Rôle | Status |
|---|---|---|
| **DGX Spark** 192.168.110.103 | Qdrant + Ollama + BGE-M3 + scripts Python d'ingestion | ✅ Actif |
| **Serveur .59** 192.168.110.59 | Backend Lexa futur (port 3010) | ⚠️ Postgres à installer |
| **Mac local** | Dev docs + git | ✅ Actif |
| **GitHub** [swigsstaking/lexa](https://github.com/swigsstaking/lexa) | Source control | ✅ Actif |

---

## Ce qu'il faut lire AVANT de démarrer la session 03

Dans cet ordre :

1. **`README.md`** — vue d'ensemble (3 min)
2. **`06-sessions/2026-04-14-session-02.md`** — journal session 02 (10 min) — **essentiel pour comprendre l'état actuel**
3. **`01-knowledge-base/INDEX.md`** — statut de la KB après ingestion LHID (5 min)
4. **`05-roadmap/milestones.md`** — roadmap mise à jour avec VS en premier canton (5 min)

**Total : ~25 min de lecture pour reprendre en pleine conscience.**

Les docs de fond (whitepaper, architecture) n'ont pas changé — pas besoin de les relire si déjà parcourus.

---

## Questions en attente de réponse du user

⚠️ **Ces 4 questions doivent être tranchées au début de la session 03** :

1. **LP (Loi sur la poursuite et faillite, RS 281.1)** — On l'ingère en priorité session 03, ou on passe aux circulaires AFC ?
   - *Reco Claude : circulaires/notices AFC d'abord, LP plus tard (procédures rares)*

2. **Circulaires AFC prioritaires** — OK pour cette liste : Info TVA 01 (méthode effective), Info TVA 03 (TDFN), Info TVA 14 (immeubles), Notice A complète (amortissements), Notice 1 (évaluation titres non cotés), Circulaires IFD 1 à 30 ?
   - *Reco Claude : OK avec cette liste, à ajuster selon dispo*

3. **KB cantonale VS** — Démarrer en session 03 (en parallèle des AFC) ou en session 04 ?
   - *Reco Claude : parallèle session 03, mais attention — la loi VS peut ne pas être en AkomaNtoso, il faudra peut-être un parser HTML/PDF dédié*

4. **Installation Postgres sur .59** — Maintenant (5 min, besoin de sudo) ou plus tard (T2 2026) ?
   - *Reco Claude : maintenant, pour ne pas avoir de surprise plus tard*

---

## Plan détaillé de la session 03 (si recommandations Claude acceptées)

### Étape 1 — Installation Postgres sur .59 (5-10 min)

```bash
ssh swigs@192.168.110.59
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-contrib-16
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Créer la base lexa + utilisateur
sudo -u postgres psql <<SQL
CREATE DATABASE lexa;
CREATE USER lexa_app WITH PASSWORD 'TBD-generate-strong-password';
GRANT ALL PRIVILEGES ON DATABASE lexa TO lexa_app;
SQL
```

Stocker le password dans `.env` (jamais commit). Noter dans la KB.

### Étape 2 — Catalogue et ingestion des circulaires AFC (1-2h)

**Sources** :
- TVA : https://www.estv.admin.ch/estv/fr/accueil/tva/publications-tva/info-tva.html
- IFD : https://www.estv.admin.ch/estv/fr/accueil/impot-federal-direct/circulaires-ifd.html

**Problème** : Les circulaires AFC sont en PDF, pas en AkomaNtoso. Il faut un parser PDF → texte. Options :
- **pdfplumber** (Python, déjà possible d'installer)
- **pymupdf / fitz**
- **Qwen-VL** (déjà sur le Spark !) pour OCR/extraction structurée

Créer un script `~/ollama-compta/scripts/ingest_afc_circulars_lexa.py` qui :
1. Télécharge les PDFs depuis les URLs
2. Extrait le texte
3. Chunke par section / numéro de paragraphe (pas par article — les PDFs sont plus libres)
4. Encode avec BGE-M3
5. Upsert dans Qdrant avec UUIDs

**Schéma de payload** pour les circulaires :
```yaml
text: "..."
law: "AFC-TVA-Info-01"  # ou "AFC-IFD-Circ-17"
label: "Info TVA 01 — Méthode effective de décompte"
article: "section 2.3"  # numéro de section
heading: "..."
rs: null  # les circulaires n'ont pas de RS
topic: "decompte_tva_effective"
date_version: "2024-01-01"
source: "afc"
url: "https://www.estv.admin.ch/..."
```

### Étape 3 — Démarrage KB Valais (1h)

**Source** : https://www.vs.ch/web/scc + https://lex.vs.ch/ (registre législatif valaisan)

Chercher la loi fiscale VS (RSVS 642.1). Vérifier si disponible en XML structuré ou seulement HTML/PDF. Créer le script `ingest_vs_laws_lexa.py` adapté au format trouvé.

Documents à cibler :
- Loi fiscale VS (RSVS 642.1)
- Règlement d'exécution (RELF)
- Barème cantonal 2026 (si disponible publiquement)

### Étape 4 — Extraction du plan comptable Käfer en format structuré (30 min)

Actuellement dans le system prompt de `comptable-suisse` (texte libre). À extraire en YAML structuré :

```yaml
accounts:
  - id: "1000"
    label: "Caisse"
    class: 1
    type: "balance_sheet_asset"
    nature: "liquid"
  - id: "1020"
    label: "Banque - compte courant"
    class: 1
    # ...
```

Puis ingérer en Qdrant avec un topic dédié `"plan_comptable_kafer"`.

### Étape 5 — Commit + mise à jour NEXT-SESSION (15 min)

```bash
cd /Users/corentinflaction/CascadeProjects/lexa
git add .
git commit -m "feat(kb): add AFC circulars, VS cantonal laws, structured Käfer plan"
git push
```

Créer `06-sessions/2026-MM-DD-session-03.md` et réécrire ce fichier.

---

## Plan alternatif (si priorité différente)

Si le user préfère plutôt scaffolder le backend, voir **session 01 NEXT-SESSION.md** pour le plan backend scaffold. Mais ma reco reste de finir la KB fédérale avant de toucher au code.

---

## État de la collection Qdrant

**Collection `swiss_law`** : **899 points**

| Loi | Articles | % du total | Statut |
|---|---|---|---|
| LTVA (641.20) | 131 | 14.6% | ✅ Session 01 (Fedlex XML) |
| LIFD (642.11) | 224 | 24.9% | ✅ Session 01 (Fedlex XML) |
| CO (220, titre 32 + autres) | 421 | 46.8% | ✅ Session 01 (Fedlex XML) |
| **LHID (642.14)** | **108** | **12.0%** | ✅ **Session 02 (Fedlex XML)** |
| Résumés ciblés (ingest_laws_v2) | 15 | 1.7% | ✅ Session 01 (manuel) |

**Manquant (priorité session 03+)** :
- LP (281.1) — procédures (~200 articles probablement)
- OIFD + OLTVA — ordonnances d'exécution
- Circulaires AFC-TVA (~15-20 documents PDF)
- Circulaires AFC-IFD (~30-40 documents PDF)
- Notices AFC (Notice A complète, Notice 1, etc.)
- Plan comptable Käfer structuré
- Standards techniques (eCH-0217, Swissdec, CAMT.053, QR)
- Lois cantonales SR (VS d'abord, puis GE, VD, FR, NE, JU, BE-Jura)

---

## Scripts d'ingestion disponibles sur le Spark

| Script | Rôle | Destructif ? |
|---|---|---|
| `~/ingest_swiss_law.py` | Parser Fedlex AkomaNtoso original (LTVA + LIFD + CO) | ⚠️ **OUI** (delete_collection) — **ne pas relancer** |
| `~/ollama-compta/scripts/ingest_laws_v2.py` | Articles hardcodés additifs | ❌ Non (upsert UUID) |
| `~/ollama-compta/scripts/ingest_lhid_lexa.py` | **Nouveau — LHID uniquement, additif** | ❌ Non (upsert UUID) |

**Règle** : à partir de maintenant, tout nouveau script d'ingestion Lexa doit suivre le pattern `ingest_*_lexa.py` (upsert UUID pur, pas de delete_collection).

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
| BGE-M3 | ~2 GB | Embeddings RAG multilingue |

Ollama config : `OLLAMA_FLASH_ATTENTION=1`, `KEEP_ALIVE=-1`, KV cache Q4.

---

## Avertissements importants (rappel)

1. **Ne jamais toucher aux 3 processus Ollama actifs sur le Spark** — ils servent à d'autres projets en prod.
2. **Ne pas supprimer le prototype `~/ollama-compta/`** — utilisé par le user pour du consulting.
3. **Ne jamais relancer `ingest_swiss_law.py` tel quel** — il détruit la collection. Pour chaque nouvelle ingestion, créer un script `*_lexa.py` dédié en upsert.
4. **Toujours citer la source** — règle absolue respectée par le modèle `comptable-suisse`.
5. **Pas de secrets dans le repo** — `.env` git-ignoré.
6. **Le fine-tuning est bloqué par aarch64** — ne pas perdre de temps à essayer sur le Spark.

---

## Configuration serveur backend Lexa (à venir)

- **Hôte** : swigs@192.168.110.59 (sw6c-1)
- **Port** : 3010
- **Path install** : `/home/swigs/lexa-backend/` (cohérence avec les autres apps)
- **PM2 name** : `lexa-backend`
- **Stack** : Node 20.19, TypeScript, Express, pg (Postgres), mongoose (MongoDB), redis, ioredis
- **Deploy pattern** (même que swigs-workflow) :
  ```bash
  rsync -avz --exclude='node_modules' --exclude='.git' --exclude='.env' \
    backend/ swigs@192.168.110.59:/home/swigs/lexa-backend/
  ssh swigs@192.168.110.59 'cd lexa-backend && npm ci --omit=dev && pm2 restart lexa-backend'
  ```

---

**Dernière mise à jour** : 2026-04-14 (fin session 02)
