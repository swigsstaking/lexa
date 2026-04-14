# Lexa — Whitepaper

**Version** : 0.1
**Date** : 2026-04-13
**Statut** : Document maître vivant — évolue à chaque session

---

## 1. Résumé exécutif

**Lexa** est une plateforme fiscale-comptable suisse pilotée par IA locale. Elle automatise de bout en bout la tenue comptable, les déclarations de TVA, la clôture annuelle et les déclarations fiscales cantonales et fédérales, pour indépendants, PME et fiduciaires.

**Ce qui la distingue radicalement de Bexio, Abacus, Accounto, Banana et Run my Accounts** :

1. **Zéro saisie manuelle** — ingestion CAMT.053 bancaire + OCR + email forward + QR-facture. L'IA classifie, l'humain valide.
2. **Interface spatiale, pas tabulaire** — canvas infini avec timeline vivante et agents visibles, au lieu de tableaux Excel-like.
3. **Clôture continue** — les livres sont toujours à jour, toujours réconciliés. Pas de stress de bouclement annuel.
4. **Optimisation proactive** — l'IA détecte les économies fiscales *pendant* l'année, pas après.
5. **IA 100% locale** — aucune donnée ne quitte le serveur DGX Spark du client/hébergeur.
6. **Citations légales systématiques** — chaque décision cite l'article de loi exact (format LIFD/LTVA/CO/LHID/cantonal).

**Cible** : indépendants, PME (Sàrl/SA), fiduciaires (mode multi-clients).
**Priorité géographique** : Suisse francophone — **VS en premier**, puis GE, VD, FR, NE, JU, BE-Jura.

---

## 2. Positionnement marché

### Paysage actuel (2026)

| Produit | Force | Faiblesse | Interface |
|---|---|---|---|
| **Bexio** | Leader PME, écosystème large | Form-based, pas d'IA véritable, cloud | Tables + formulaires |
| **Abacus** | Puissance pour grosses structures | Legacy, courbe d'apprentissage brutale | Desktop-feeling |
| **Accounto** | IA la plus avancée du marché suisse | Toujours prisonnier du paradigme formulaire, cloud | Tables + assistant latéral |
| **Banana** | Simplicité, entrée de gamme | Spreadsheet-like, pas d'automatisation | Excel-like |
| **Run my Accounts** | Approche hybride fiduciaire | Cher, pas d'IA | Service + portail |

**Observation clé** : tous partagent la même logique *"formulaire → saisie → écriture → clôture"*. Aucun n'a repensé le paradigme autour de l'IA. Accounto s'en approche, mais reste sur une UX traditionnelle.

### Positionnement Lexa

**Lexa = Linear / Arc / Figma de la comptabilité suisse.**

Un produit dense mais calme, spatial, conversationnel, où l'IA fait le travail et l'humain orchestre. La comptabilité devient un flux naturel, pas une corvée administrative.

---

## 3. Architecture en 5 couches

```
┌─────────────────────────────────────────────────────────────┐
│ 5. INTERFACE      Canvas + conversationnel + timeline       │
│    (React/Vite)                                             │
├─────────────────────────────────────────────────────────────┤
│ 4. EXECUTION      Générateurs de formulaires déclaratifs    │
│    (templates)    (TVA AFC, fiscales cantonales, Swissdec)  │
├─────────────────────────────────────────────────────────────┤
│ 3. REASONING      Agents IA spécialisés multi-modèles       │
│    (Ollama)       (classifier, TVA, fiscal-PP/PM, clôture…) │
├─────────────────────────────────────────────────────────────┤
│ 2. DATA           Event-sourcing immuable + projections     │
│    (Postgres)     + documents annexes                       │
│    (Mongo)                                                  │
├─────────────────────────────────────────────────────────────┤
│ 1. KNOWLEDGE      Base légale vectorielle + knowledge graph │
│    (Qdrant)       (LIFD, LHID, LTVA, CO, 7 cantons SR…)    │
└─────────────────────────────────────────────────────────────┘
```

### Couche 1 — Knowledge (le cerveau légal)

**Déjà existant sur Spark** (prototype `~/ollama-compta/`) :
- Collection Qdrant `swiss_law` avec **776 articles Fedlex** ingérés (LTVA 131, LIFD 224, CO 421)
- Embeddings **BGE-M3** (1024 dim, multilingue FR/DE/IT/EN)
- Textes officiels XML AkomaNtoso depuis Fedlex, versionnés par date

**À ajouter dans les prochaines sessions** :
- **LHID** (RS 642.14) — loi d'harmonisation, base du droit cantonal
- **LP** (RS 281.1) — poursuite et faillite
- **Circulaires AFC** — TVA + directe (interprétation administrative)
- **Jurisprudence TF** — arrêts fiscaux (ATF)
- **Lois fiscales cantonales** des 7 cantons SR prioritaires
- **Règlements d'application cantonaux**
- **Barèmes annuels** (révisés chaque année)
- **Formulaires officiels cantonaux** (PDF + XML si disponible)
- **Notices AFC** (Notice A amortissements, Notice 1, etc.)
- **Plan comptable PME Käfer** structuré
- **Swiss GAAP RPC** (référentiel comptable)
- **Standards techniques** : eCH-0217 (échange fiscal), Swissdec (salaires), CAMT.053/.054, QR-facture

**Format de stockage** :
```yaml
document_id: "LIFD-art-58"
law: "LIFD"
rs: "642.11"
article: "58"
title: "Détermination du bénéfice net"
text: "…"
effective_from: "2025-01-01"
effective_to: null
source_url: "https://fedlex.data.admin.ch/..."
jurisdiction: "federal"
topic: ["impot_direct", "benefice_net", "personne_morale"]
version: 1
```

### Couche 2 — Data (event-sourcing)

**Pourquoi event-sourcing** : sur des données financières, on ne peut pas se permettre de "patcher" des écritures. Chaque fait est un événement immuable. Les livres comptables sont une projection calculée, pas la vérité primaire. Ça rend possible :

- Clôture continue (re-projection à la volée)
- Simulation parallèle (et si ?)
- Rollback total sans perte d'audit trail
- **L'IA peut écrire librement** parce qu'elle ne détruit jamais rien

**Postgres** pour les événements comptables (ACID non négociable), **MongoDB** pour les documents annexes (PDFs, images, emails parsés).

**Événements types** :
- `TransactionIngested` (source : CAMT.053, OCR, manual)
- `TransactionClassified` (par quel agent, quelle confiance, quelles citations)
- `ClassificationValidated` (par l'utilisateur)
- `DeclarationGenerated`
- `DeclarationSubmitted`
- `AIFeedbackReceived`

### Couche 3 — Reasoning (système multi-agents)

Voir [`02-architecture/agent-system.md`](../02-architecture/agent-system.md) pour les détails complets.

**En bref** : 7 agents spécialisés tournant sur les modèles locaux du DGX Spark (`comptable-suisse`, `comptable-suisse-fast`, `qwen3-vl-ocr`, `deepseek-ocr`, BGE-M3 pour RAG). Un orchestrateur distribue les tâches en fonction de leur criticité (temps réel vs batch) et de leur complexité (fast vs précision max).

### Couche 4 — Execution (formulaires comme code)

Chaque déclaration officielle est un **template déclaratif versionné** :

```yaml
form_id: "TVA-AFC-decompte-effectif"
version: "2024-01-01"
fields:
  - id: "ca_imposable_81"
    source: "projection.tva.ca_imposable_81"
    validation: "required"
  - id: "impot_prealable"
    source: "projection.tva.impot_prealable"
  # ...
output:
  pdf: "template.tex"
  xml: "eCH-0217-schema.xsd"
```

L'IA remplit le template, l'utilisateur voit le PDF/XML officiel généré, signe, dépose via API (ePortal Confédération, portails cantonaux quand disponibles) ou export.

### Couche 5 — Interface

Voir [`04-interface/canvas-paradigm.md`](../04-interface/canvas-paradigm.md) (à créer).

Principes directeurs :
1. **Spatial, pas tabulaire** (react-flow / tldraw)
2. **Conversationnel first** (chat primaire, pas gadget)
3. **Timeline vivante** (passé consolidé, présent en cours, futur prédit)
4. **Agents visibles** (entités sur le canvas, raisonnement en temps réel)
5. **Briefing quotidien proactif** (comme Swigs Pro, mais poussé)
6. **Multi-modal total** (photo, voix, drag-drop, email forward, QR)

Stack : React 18 + Vite 5 + TailwindCSS + **react-flow** ou **tldraw** pour le canvas, **Zustand** pour l'état, **TanStack Query** pour les mutations, **framer-motion** pour les animations subtiles.

Esthétique : dense mais calme, typographie sérieuse (données financières = gravité visuelle), dark mode par défaut, inspiration Linear / Arc / Things 3.

---

## 4. Stack technique

### Backend

- **Serveur prod** : **192.168.110.59** (`sw6c-1`), aux côtés de swigs-workflow, swigs-hub, swigs-task, etc.
- **Port réservé** : `3010` (les ports 3001-3009 sont déjà pris par les autres apps Swigs)
- **Node.js 20.19** + Express + TypeScript (cohérence avec l'écosystème Swigs)
- **Postgres 16** pour l'event store comptable (ACID, JSONB pour les payloads) — **à installer sur .59**
- **MongoDB** pour documents annexes, métadonnées, configuration multi-tenant — **déjà actif sur .59 port 27017**
- **Qdrant** pour la base vectorielle légale — **déjà en place sur DGX Spark (.103) port 6333**
- **Redis** pour cache + queue jobs (BullMQ) — **déjà actif sur .59 port 6379**
- **Node-cron** pour clôture continue et veille réglementaire
- **PM2** pour la gestion du processus (cohérence avec les autres apps Swigs)

### IA (100% local, DGX Spark)

Modèles exclusivement ceux **déjà présents sur le Spark** :

| Modèle | Usage | Taille |
|---|---|---|
| `comptable-suisse` (Qwen3.5 27B Q8, fine-tuné) | Raisonnement fiscal complexe, batch, précision max | 29 GB |
| `comptable-suisse-fast` (Q4) | Classification interactive, chat utilisateur | 17 GB |
| `qwen3-vl-ocr` | OCR visuel (photos, PDFs scannés) | 6.1 GB |
| `deepseek-ocr` | OCR alternatif / fallback | 6.7 GB |
| `qwen3-vl:8b` | Vision générale | 6.1 GB |
| `qwen3.5:27b-q8_0` | Fallback généraliste sans system prompt | 29 GB |
| `qwen3.5:9b-optimized` | Tâches légères | 10 GB |
| **BGE-M3** (embeddings) | RAG multilingue, 1024 dim | ~2 GB |

**Inférence** : Ollama (déjà en place, `OLLAMA_FLASH_ATTENTION=1`, `KEEP_ALIVE=-1`). SGLang et Triton sont installés si besoin d'optimisation avancée.

### Frontend

- **React 18 + Vite 5**
- **TailwindCSS 3**
- **react-flow** ou **tldraw** pour le canvas infini
- **Zustand** pour l'état global
- **TanStack Query v5** pour les mutations/sync serveur
- **framer-motion** pour les animations
- **i18next** (FR/DE/IT/EN — FR priorité v1)

### DevOps

- **PM2** pour la gestion des processus backend (comme tout l'écosystème Swigs)
- **Nginx** reverse proxy avec support WebSocket
- **Docker** pour Qdrant (déjà en place sur Spark)
- **GitHub / GitLab** pour le versionning

---

## 5. Modèle de données compta (résumé)

### Agrégats principaux

- **Tenant** (multi-tenant : un utilisateur = un dossier comptable, un fiduciaire = N dossiers)
- **FiscalPeriod** (année fiscale, clôture continue)
- **Transaction** (événement atomique : encaissement, décaissement, écriture manuelle)
- **Document** (facture, note de frais, relevé bancaire, contrat — avec OCR + classification)
- **Account** (compte du plan comptable Käfer ou custom)
- **Entry** (écriture comptable double : débit + crédit)
- **Declaration** (TVA, fiscale PP, fiscale PM, Swissdec)
- **AIDecision** (trace de chaque décision IA : agent, modèle, confiance, citations)

Chaque mutation passe par un événement immuable dans l'event store.

---

## 6. Conformité & sécurité

### Conformité légale

- **Art. 957 CO** : obligation de tenue comptable
- **Art. 958 CO** : comptes annuels doivent donner une image fidèle (true and fair view)
- **Art. 958f CO** : conservation 10 ans des pièces comptables
- **Art. 70 LTVA** : conservation TVA 10 ans
- **nLPD (2023)** : données personnelles suisses
- **GDPR** : pour clients UE

### Sécurité

- **Données fiscales = critique.** Aucun envoi cloud.
- Chiffrement at-rest (Postgres + Mongo + Qdrant)
- Chiffrement in-transit (TLS 1.3 partout)
- Isolation multi-tenant stricte
- Audit trail immuable (event store)
- SSO via **Swigs Hub v2** (OAuth 2.0 PKCE, tokens 15min Hub / 7j app)
- Authentification forte optionnelle (TOTP)

### Responsabilité (phase 1)

Lexa **prépare**, l'utilisateur **valide et signe**. Les déclarations sont marquées explicitement "préparé automatiquement par Lexa — à vérifier et valider par votre fiduciaire avant dépôt". Transition possible vers un mode "Lexa assume" à terme, avec assurance RC professionnelle dédiée.

**Validation fiduciaire externe** : la stratégie retenue est de s'appuyer sur les **agents experts IA** tout au long du développement (citations systématiques, base de connaissances Fedlex officielle, disclaimer automatique). Une validation par un cabinet fiduciaire externe sera réalisée **uniquement en fin de développement**, juste avant le passage en production, pour sécuriser le lancement public. On se passe d'un consultant fiscal salarié pendant les 24 mois de build.

---

## 7. Intégration avec Swigs Pro

Lexa est **standalone** mais connectée via un **pont natif** :

- **SSO** commun via Swigs Hub v2 (même utilisateur, switch rapide entre Pro et Lexa)
- **Facture émise dans Pro → écriture comptable dans Lexa** (Event Bus WebSocket `invoice.created`)
- **Paiement client dans Pro → réconciliation automatique dans Lexa**
- **Note de frais dans Pro → document comptable dans Lexa**

Pas de réécriture de Pro. Pas de migration de données. Les deux produits coexistent et se complètent.

---

## 8. Roadmap 24 mois (résumé)

Voir [`05-roadmap/milestones.md`](../05-roadmap/milestones.md) pour le détail.

| Trimestre | Livrable clé |
|---|---|
| **T1 2026** | Whitepaper, archi validée, knowledge base fédérale complétée (prototype → v1), OCR pipeline intégré |
| **T2 2026** | Backend event-sourced, agents classifier + TVA, ingestion CAMT.053, UI canvas v0 |
| **T3 2026** | MVP comptable : ingestion + classification + TVA pour indépendants (alpha interne) |
| **T4 2026** | Beta privée — 5 fiduciaires partenaires ; ajout lois cantonales GE + VD + FR |
| **T1 2027** | Clôture annuelle continue, agents fiscal-PP (GE + VD), simulateur fiscal |
| **T2 2027** | Agents fiscal-PM (Sàrl/SA), annexes CO, bilan fiscal |
| **T3 2027** | Cantons NE + JU + VS + BE-Jura, mode fiduciaire multi-clients, Swissdec salaires |
| **T4 2027** | Optimisation continue, intégrations ePortal/portails cantonaux, lancement public |

**Gain estimé grâce au prototype existant** : 4-5 mois sur la roadmap initiale (fondations Qdrant + BGE-M3 + modèle `comptable-suisse` + dataset + OCR déjà opérationnels).

---

## 9. Risques & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Hallucination IA sur du fiscal | Moyenne | Critique | RAG systématique + citation obligatoire + validation humaine + audit fiduciaire final |
| Évolution réglementaire (lois qui changent) | Haute | Moyen | Base de connaissances versionnée par date, veille automatisée (cron sur Fedlex RSS) |
| Diversité cantonale (26 systèmes) | Haute | Élevé | Commencer par 7 cantons SR, architecture plugin par canton, pas d'étalement prématuré |
| Complexité event-sourcing | Moyenne | Moyen | Pattern éprouvé, Postgres + JSONB suffit, éviter des outils type EventStoreDB en v1 |
| Adoption utilisateur (paradigme inhabituel) | Moyenne | Élevé | Mode "tableau classique" caché en fallback + onboarding assisté IA |
| Responsabilité légale (mauvaise déclaration) | Faible | Critique | Disclaimer explicite, signature humaine obligatoire, audit fiduciaire, RC pro à terme |
| Dépendance au DGX Spark | Moyenne | Moyen | Architecture abstrait l'inférence (HTTP API) — migrable vers un autre serveur GPU si besoin |
| Fine-tuning LoRA bloqué sur aarch64 | Haute (déjà identifié) | Faible | Fine-tuning sur machine x86 externe, import Modelfile ; system prompt + RAG suffisent pour démarrer |

---

## 10. Décisions ouvertes

À trancher dans les prochaines sessions :

1. **Structure des tenants** : un dossier par entité juridique, ou un dossier par utilisateur avec N entités ?
2. **Modèle de tarification** : abonnement simple, par volume de transactions, par déclaration générée, par nombre de clients (fiduciaire) ?
3. **Gouvernance de la base de connaissances** : comment valider les nouvelles lois ingérées ? Automatique ? Expert humain en boucle ?
4. **Degré d'autonomie de l'IA** : peut-elle valider seule les écritures < seuil (ex : 50 CHF), ou toujours humain ?
5. **Langue v1** : FR uniquement, ou FR+DE dès le départ ?
6. **Intégration e-banking** : API bancaires directes (peu disponibles en CH) ou import CAMT.053 manuel ?

---

## 11. Glossaire

- **LIFD** : Loi fédérale sur l'impôt fédéral direct (RS 642.11)
- **LHID** : Loi fédérale sur l'harmonisation des impôts directs des cantons et des communes (RS 642.14)
- **LTVA** : Loi fédérale sur la TVA (RS 641.20)
- **CO** : Code des obligations (RS 220), titre 32 (art. 957-963b) pour la comptabilité
- **LP** : Loi fédérale sur la poursuite pour dettes et la faillite (RS 281.1)
- **AFC** : Administration fédérale des contributions
- **ATF** : Arrêt du Tribunal fédéral
- **Käfer** : Plan comptable PME suisse de référence
- **Swiss GAAP RPC** : Normes comptables suisses (Recommandations relatives à la présentation des comptes)
- **PP / PM** : Personne Physique / Personne Morale
- **CAMT.053** : Relevé de compte ISO 20022 (standard bancaire)
- **eCH-0217** : Standard suisse d'échange de données fiscales
- **Swissdec** : Standard suisse de transmission des données salariales
- **Notice A AFC** : Circulaire de l'AFC sur les amortissements admis fiscalement
- **TDFN** : Taux de la dette fiscale nette (méthode TVA simplifiée)
- **ICC / IFD** : Impôt Cantonal et Communal / Impôt Fédéral Direct
