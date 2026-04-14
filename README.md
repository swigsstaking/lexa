# Lexa

> Plateforme fiscale-comptable suisse pilotée par IA locale. Zéro saisie. Zéro formulaire. Citations légales systématiques.

**Lexa** — du latin *lex, legis* (loi). Un nom court, moderne, évoquant à la fois le droit et l'IA. Prononçable en FR/DE/IT/EN.

**Statut** : Phase 0 — Fondations documentaires. Pas encore de code applicatif.

**Repo** : [github.com/swigsstaking/lexa](https://github.com/swigsstaking/lexa)

**Dernière session** : 2026-04-14 (session 02)

---

## Navigation rapide

| Document | Pour quoi |
|---|---|
| [`00-vision/whitepaper.md`](00-vision/whitepaper.md) | Le document maître — vision, archi, roadmap |
| [`00-vision/north-star.md`](00-vision/north-star.md) | La vision en 1 page |
| [`02-architecture/overview.md`](02-architecture/overview.md) | Architecture en 5 couches |
| [`02-architecture/agent-system.md`](02-architecture/agent-system.md) | Système multi-agents (modèles Spark) |
| [`05-roadmap/milestones.md`](05-roadmap/milestones.md) | Roadmap 24 mois |
| [`06-sessions/NEXT-SESSION.md`](06-sessions/NEXT-SESSION.md) | **Point de reprise pour la prochaine session** |
| [`06-sessions/INDEX.md`](06-sessions/INDEX.md) | Historique des sessions |

---

## Principes de travail

1. **Chaque session se termine par un document de relais** (`06-sessions/YYYY-MM-DD-session-NN.md`) + mise à jour de `NEXT-SESSION.md`
2. **Le whitepaper est le document vivant** — il évolue à chaque décision structurelle
3. **La base de connaissances est versionnée** — chaque loi a une date d'entrée en vigueur, une source, une URL Fedlex
4. **Tous les modèles IA tournent en local** sur le DGX Spark (192.168.110.103). Pas de cloud.
5. **Construire par-dessus le prototype existant** (`~/ollama-compta/` sur Spark) plutôt que repartir à zéro

---

## Infrastructure existante (sur DGX Spark)

- **Base vectorielle** : Qdrant `swiss_law` — 776 articles Fedlex (LTVA, LIFD, CO)
- **Modèle principal** : `comptable-suisse` (Qwen3.5 27B Q8, 29 GB, 262K ctx, score 97% sur grille d'éval)
- **Modèle rapide** : `comptable-suisse-fast` (Q4, 17 GB, 11 tok/s)
- **Embeddings** : BGE-M3 (1024 dim, FR/DE/IT/EN)
- **OCR** : `qwen3-vl-ocr`, `deepseek-ocr`, service Python dédié
- **Dataset fine-tuning** : 501 exemples audités

---

## Cible produit

- Indépendants / raison individuelle
- Sàrl / SA
- Fiduciaires (mode multi-clients, white-label potentiel)
- **Premier canton d'implémentation** : **Valais (VS)**
- Puis : GE, VD, FR, NE, JU, BE-Jura

---

## Infrastructure Lexa (prod)

- **Backend** : 192.168.110.59 (serveur Swigs apps) — port `3010` réservé, PM2, Node 20
- **Base vectorielle + IA** : 192.168.110.103 (DGX Spark) — Qdrant + Ollama
- **Postgres** : à installer sur `.59` (event store)
- **MongoDB** : déjà actif sur `.59` (port 27017)
- **Redis** : déjà actif sur `.59` (port 6379)
- **SSO** : Swigs Hub v2 (OAuth 2.0 PKCE)
