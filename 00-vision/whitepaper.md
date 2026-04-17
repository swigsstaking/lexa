# Lexa — Whitepaper

**Version** : 0.2
**Date** : 2026-04-17
**Statut** : V1 beta livré à ~98% — document maître vivant

---

## État d'avancement V1 (17 avril 2026)

| # | Différenciateur | État | Détails |
|---|---|---|---|
| 1 | **Zéro saisie manuelle** | ✅ **100%** | CAMT.053 + OCR (qwen3-vl-ocr 85-95% conf) + QR-facture + **Email IMAP forward** (commit `d4f3531`, Infomaniak) |
| 2 | Interface dense & exploratoire | ✅ 100% | React Flow grand livre + Collapse classes Käfer + Mobile liste groupée + FiscalTimeline |
| 3 | Clôture continue | ✅ 95% | `/close/:year` + auto-refresh matview ledger_entries. Manque détection auto provisions/amortissements (P3) |
| 4 | Optimisation proactive | ✅ 100% | Briefing Conseiller quotidien cron 06:00 CH (tz Europe/Zurich) + simulateur LPP/3a/dividende-salaire |
| 5 | IA 100% locale | ✅ 100% | Ollama (14 agents) + **vLLM NVFP4 Qwen3.5-35B-A3B** sur DGX Spark (classifier 100% match Käfer) |
| 6 | Citations légales systématiques | ✅ 100% | RAG Qdrant 9887 pts swiss_law, citations LTVA/LIFD/LHID/CO/cantonal |

### Livrables V1.2 (en cours)
- ✅ **Export XML eCH-0119** (PP) + **eCH-0229** (PM) pour dépose électronique AFC (commit `112ad07`)
- ✅ **Integration Swigs Pro** consumer (commit `c894d6a`) — `POST /api/bridge/pro-events` avec HMAC
- 🟡 Producteur Swigs Pro (en cours — hook invoice.created/paid côté swigs-workflow)
- 🟡 Wizard dual compte privé+entreprise (en cours — route `/onboarding/add-account`)

### Dettes connues V1.3+
- Validation XSD formelle eCH-0119 (requiert Java/libxml2)
- eCH-0229 XSD officiel (quand eCH publie version stable)
- API dépose directe ePortal AFC (non documentée publiquement)
- Dashboard fiduciaire multi-clients consolidé (V2)
- Fine-tuning Qwen3.5-9B sur dataset Lexa pour classifier 10x plus rapide (V1.3)

---

## 1. Résumé exécutif

**Lexa** est une plateforme fiscale-comptable suisse pilotée par IA locale. Elle automatise de bout en bout la tenue comptable, les déclarations de TVA, la clôture annuelle et les déclarations fiscales cantonales et fédérales, pour indépendants, PME et fiduciaires.

**Ce qui la distingue radicalement de Bexio, Abacus, Accounto, Banana et Run my Accounts** :

1. **Zéro saisie manuelle** — ingestion CAMT.053 bancaire + OCR + email forward + QR-facture. L'IA classifie, l'humain valide.
2. **Interface dense et exploratoire, pas tabulaire** — grand livre visuel graphique (graphe de flux comptables), timeline fiscale interactive, navigation par clic direct sur les flux comptables, au lieu de tableaux Excel-like.
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
- **Standards techniques** : eCH-0119 (déclaration fiscale PP), eCH-0229 (déclaration PM), Swissdec (salaires), CAMT.053/.054, QR-facture, eCH-0217 (décomptes TVA)

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

Voir [`04-interface/interface-paradigm.md`](../04-interface/interface-paradigm.md) (à créer).

Principes directeurs :
1. **Grand livre visuel (graphe de flux comptables)** remplace le plan comptable tabulaire — react-flow utilisé pour le graphe métier spécialisé, pas un canvas infini générique
2. **Chat conversationnel first** (Cmd+K primaire, pas gadget)
3. **Timeline fiscale interactive** filtrable (passé consolidé, présent en cours, futur prédit)
4. **Wizards guidés** pour déclarations (TVA, fiscales, Swissdec)
5. **Briefing quotidien proactif** (comme Swigs Pro, mais poussé)
6. **Multi-modal total** (photo, voix, drag-drop, email forward, QR)

Note V2 : les agents visibles comme entités sur un canvas infini (raisonnement en temps réel visible) sont reportés en V2 après feedback beta fiduciaire — décision 2026-04-16.

Stack : React 18 + Vite 5 + TailwindCSS + **react-flow** (grand livre visuel), **Zustand** pour l'état, **TanStack Query** pour les mutations, **framer-motion** pour les animations subtiles.

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
| **`Qwen3.5-35B-A3B-NVFP4` (vLLM)** | **Classifier production (MoE 3B actifs, 100% match Käfer)** | **22 GB** |
| `lexa-reasoning` (Qwen3.5 9B Q8, fine-tuné) | Raisonnement fiscal complexe | 10 GB |
| `lexa-tva` (fine-tuné) | Décomptes TVA | 10 GB |
| `lexa-fiscal-pp-{vs,ge,vd,fr,ne,ju,bj}` (fine-tuné) | Déclarations PP 7 cantons | 10 GB × 7 |
| `lexa-fiscal-pm` (fine-tuné) | Déclarations PM Sàrl/SA | 10 GB |
| `lexa-cloture` (fine-tuné) | Clôture continue CO 957-963 | 10 GB |
| `lexa-audit` (fine-tuné) | Audit intégrité + citations | 10 GB |
| `lexa-conseiller` (fine-tuné) | Conseiller fiscal proactif + briefing | 10 GB |
| `qwen3-vl-ocr` | OCR visuel (photos, PDFs scannés) | 6.1 GB |
| **BGE-M3** (embeddings llama.cpp) | RAG multilingue, 1024 dim | ~2 GB |

**Inférence** : Ollama (déjà en place, `OLLAMA_FLASH_ATTENTION=1`, `KEEP_ALIVE=-1`). SGLang et Triton sont installés si besoin d'optimisation avancée.

### Frontend

- **React 18 + Vite 5**
- **TailwindCSS 3**
- **react-flow** pour le grand livre visuel (graphe de flux comptables)
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
| **T1 2026** | Whitepaper, archi validée, KB fédérale, OCR | ✅ livré |
| **T2 2026** | Backend event-sourced, classifier + TVA, CAMT.053, grand livre visuel v0 | ✅ livré (avance) |
| **T3 2026** | MVP comptable alpha interne | ✅ livré (avance) |
| **T4 2026** | Beta privée + cantons GE + VD + FR | ✅ **livré** (avance de 6+ mois) |
| **T1 2027** | Clôture continue, fiscal-PP GE/VD, simulateur | ✅ **livré** (avance ~9 mois) |
| **T2 2027** | Fiscal-PM (Sàrl/SA), annexes CO, bilan fiscal | ✅ **livré** (avance ~9 mois) |
| **T3 2027** | Cantons NE + JU + VS + BE-Jura, fiduciaire, Swissdec | 🟡 VS fait, NE/JU/BJ modèles existent, fiduciaire partiel, Swissdec Form 11 OK |
| **T4 2027** | Optimisation continue, ePortal, lancement public | 🟡 Briefing livré, ePortal API non disponible publiquement, eCH-0119/0229 XML livré |

**Avance réelle constatée (17 avril 2026)** : **~9-12 mois** sur la roadmap initiale. Le V1 beta peut être ouvert dès maintenant. Les items T3-T4 2027 restants sont des extensions non bloquantes.

**Gain estimé grâce au prototype existant** : 4-5 mois sur la roadmap initiale (fondations Qdrant + BGE-M3 + modèles Lexa fine-tunés + OCR déjà opérationnels).

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

### Décision tranchée — 2026-04-16

**Canvas spatial ambitieux (agents visibles comme nodes sur un canvas infini)** → reporté en V2 après feedback beta fiduciaire.

**Raison** : après les itérations du workspace (session 38), le paradigme "canvas infini avec tous les agents visibles" n'a pas encore été validé par des utilisateurs réels. Imposer un paradigme UX radical sans validation beta serait risqué. La V1 garde le **grand livre visuel** (graphe de flux comptables avec react-flow, déjà implémenté dans `/workspace`) comme différenciateur fort vs Bexio/Abacus, couplé à une interface classique Linear-like dense et exploratoire.

**Ce qui reste V1 (différenciateurs forts préservés)** :
- Grand livre visuel graphique (graphe react-flow spécialisé plan comptable)
- Chat conversationnel Cmd+K
- Timeline fiscale interactive
- Wizards guidés pour déclarations
- OCR + CAMT.053 + QR-facture (zéro saisie)
- 14 agents IA spécialisés locaux
- Citations légales systématiques
- Clôture continue

**Ce qui passe en V2** :
- Canvas infini générique avec agents visibles comme entités
- Raisonnement en temps réel des agents visible sur le canvas
- Vue "orchestrateur" en direct

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
