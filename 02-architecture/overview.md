# Architecture — Vue d'ensemble

**Version** : 0.1
**Date** : 2026-04-13

---

## Les 5 couches de Lexa

```
┌─────────────────────────────────────────────────────────────┐
│ 5. INTERFACE      Grand livre visuel + conversationnel + timeline │
│                   React 18 + Vite + react-flow + Zustand        │
├─────────────────────────────────────────────────────────────┤
│ 4. EXECUTION      Générateurs de formulaires déclaratifs    │
│                   Templates YAML versionnés                 │
├─────────────────────────────────────────────────────────────┤
│ 3. REASONING      Système multi-agents                      │
│                   Ollama (DGX Spark 192.168.110.103)        │
├─────────────────────────────────────────────────────────────┤
│ 2. DATA           Event-sourcing + projections              │
│                   Postgres 16 (compta) + Mongo (docs)       │
├─────────────────────────────────────────────────────────────┤
│ 1. KNOWLEDGE      Base légale vectorielle + graph           │
│                   Qdrant + BGE-M3 (déjà en place)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Couche 1 — Knowledge Layer

**Objectif** : que tout raisonnement fiscal/comptable soit fondé sur une source officielle citée, versionnée, consultable.

### Composants

- **Qdrant** (vector DB, déjà installé sur Spark, port 6333)
  - Collection `swiss_law` : 776 articles Fedlex déjà ingérés (LTVA 131, LIFD 224, CO 421)
  - À étendre : LHID, LP, circulaires AFC, jurisprudence TF, lois cantonales SR, barèmes, formulaires, notices AFC
- **BGE-M3** (embeddings multilingue, 1024 dim, FR/DE/IT/EN, déjà installé)
- **Knowledge Graph** (Postgres, à construire) : relations entre concepts, articles, formulaires, décisions admin

### Format canonique des documents

```yaml
document_id: "LIFD-art-58"
law: "LIFD"
rs: "642.11"
article: "58"
title: "Détermination du bénéfice net"
text: "…"
effective_from: "2025-01-01"
effective_to: null
jurisdiction: "federal"  # federal | cantonal-GE | cantonal-VD | ...
topic: ["impot_direct", "benefice_net", "personne_morale"]
source_url: "https://fedlex.data.admin.ch/..."
version: 1
language: "fr"
related: ["LIFD-art-59", "LIFD-art-60"]
```

### Ingestion

- Script Python dédié (réutilise `~/ollama-compta/scripts/ingest_laws_v2.py` comme base)
- Parser AkomaNtoso XML (format Fedlex officiel)
- Chunking intelligent : 1 article = 1 chunk (pas de découpage brutal)
- Embedding par article complet (BGE-M3 supporte jusqu'à 8192 tokens)
- Update incrémental : si la loi change, on version sans détruire l'ancien

### Veille réglementaire (automatique)

- **Cron quotidien** qui vérifie Fedlex RSS + sites cantonaux
- Nouvelle version détectée → ingestion + notification admin
- Ancien document marqué `effective_to` sans suppression (historique préservé)

---

## Couche 2 — Data Layer (event-sourcing)

### Pourquoi event-sourcing

Sur des données financières, la mutation destructive est interdite. Chaque fait est un **événement immuable**. Les "livres comptables" sont une **projection** calculée à partir des événements, pas la vérité primaire.

**Bénéfices** :
- ✅ Clôture continue (re-projection à la volée)
- ✅ Simulation parallèle (et si on change cette classification ?)
- ✅ Rollback total sans perte d'audit trail
- ✅ L'IA peut écrire librement — elle ne détruit jamais rien
- ✅ Audit fiscal trivial (tout est historisé)
- ✅ Multi-tenant propre (event streams isolés par tenant)

### Structure

- **Event Store** : Postgres 16, une table `events` avec JSONB pour les payloads
- **Projections** : vues matérialisées + tables dénormalisées pour les lectures rapides (grand livre, balance, bilan, compte de résultat)
- **Snapshots** : à intervalles réguliers, pour accélérer la reconstruction

### Types d'événements (non exhaustif)

```typescript
type LexaEvent =
  | { type: "TransactionIngested", source: "camt053" | "ocr" | "manual" | "swigs-pro", payload: {...} }
  | { type: "TransactionClassified", agentId: string, modelId: string, confidence: number, citations: Citation[], payload: {...} }
  | { type: "ClassificationValidatedByUser", userId: string, correction?: {...} }
  | { type: "EntryPosted", entryId: string, debit: {...}, credit: {...} }
  | { type: "DocumentUploaded", documentId: string, ocrResult: {...} }
  | { type: "DeclarationGenerated", declarationType: "TVA" | "PP-GE" | "PM-VD" | ..., data: {...} }
  | { type: "DeclarationSubmittedToAuthority", reference: string, submittedAt: Date }
  | { type: "AIRecommendationIssued", type: "optimization" | "warning" | "info", content: string }
  | { type: "FiscalPeriodClosed", periodId: string, lockedAt: Date };
```

### Postgres schema (simplifié)

```sql
CREATE TABLE events (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  stream_id     uuid NOT NULL,
  sequence      bigint NOT NULL,
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  metadata      jsonb NOT NULL,
  occurred_at   timestamptz NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, stream_id, sequence)
);

CREATE INDEX events_tenant_stream ON events(tenant_id, stream_id);
CREATE INDEX events_type ON events(type);
CREATE INDEX events_occurred ON events(occurred_at);
```

### MongoDB (annexes)

- Documents uploadés (PDFs, images) avec GridFS
- OCR bruts (avant extraction structurée)
- Emails parsés
- Métadonnées multi-tenant, configuration utilisateur
- Templates email/notification

---

## Couche 3 — Reasoning Layer

Voir [`agent-system.md`](agent-system.md) pour le détail complet.

**En bref** : 7 agents spécialisés + 1 orchestrateur, tournant sur les modèles Ollama du DGX Spark. Chaque agent a un rôle défini, un modèle préféré (fast ou précis), et un accès à la base de connaissances via RAG.

---

## Couche 4 — Execution Layer

### Templates déclaratifs

Chaque déclaration officielle est un template YAML versionné. L'IA remplit les champs à partir des projections de l'event store, l'utilisateur voit le PDF/XML généré, signe, dépose.

**Exemple** :

```yaml
form_id: "TVA-AFC-decompte-effectif"
version: "2024-01-01"
applies_to: { country: "CH", legal_form: "*" }
fields:
  - id: "ca_imposable_81"
    label: "Chiffre d'affaires imposable au taux de 8.1%"
    source: "projection.tva.ca_81.period"
    validation: "required"
  - id: "ca_imposable_26"
    label: "CA taux réduit 2.6%"
    source: "projection.tva.ca_26.period"
  - id: "impot_prealable"
    label: "Impôt préalable déductible"
    source: "projection.tva.impot_prealable.period"
output:
  pdf_template: "templates/tva-effectif-fr.tex"
  xml_schema: "schemas/eCH-0217-tva.xsd"
submission:
  method: "ePortal"  # ou "manual-download"
  endpoint: "https://www.estv.admin.ch/..."
```

### Formulaires à supporter (phase 1)

- **Décompte TVA effectif** (trimestriel / semestriel)
- **Décompte TVA TDFN** (taux de la dette fiscale nette, semestriel)
- **Déclaration fiscale PP GE** (formulaire IC + annexes)
- **Déclaration fiscale PP VD**
- **Déclaration fiscale PM Sàrl/SA** (cantons SR)
- **Certificat de salaire** (Swissdec Form 11)
- **Comptes annuels** (bilan + compte de résultat + annexe CO 959a-959c)
- **Rapport de gestion** (CO 961c pour les entreprises soumises au contrôle ordinaire)

---

## Couche 5 — Interface Layer

### Stack

- **React 18 + Vite 5**
- **TailwindCSS 3**
- **react-flow** pour le grand livre visuel (graphe de flux comptables)
- **Zustand** pour l'état global
- **TanStack Query v5** pour les mutations / sync serveur
- **framer-motion** pour animations subtiles
- **i18next** (FR prioritaire, DE/IT/EN à suivre)
- **recharts** ou **visx** pour les graphs intégrés au canvas

### Principes d'interface (les "2 ans d'avance")

1. **Grand livre visuel** remplace le plan comptable tabulaire — graphe de flux comptables (react-flow, spécialisé plan Käfer)
2. **Chat conversationnel first** (Cmd+K, pas un gadget latéral)
3. **Timeline fiscale interactive** (scroll dans l'année fiscale, filtrable)
4. **Wizards guidés** pour déclarations (TVA, fiscale PP/PM, Swissdec)
5. **Briefing quotidien proactif** (inspiré de Swigs Pro)
6. **Multi-modal total** (photo/voix/drag/email/QR)

Note V2 (décision 2026-04-16) : les agents visibles comme entités sur un canvas infini sont reportés après feedback beta fiduciaire.

### Modes de vue (togglable)

- **Grand livre visuel** (défaut, graphe react-flow)
- **Timeline** (chronologique pure)
- **Documents** (bibliothèque OCR)
- **Conversations** (historique IA)
- **Livres** (fallback tabulaire pour les comptables traditionnels)

### Esthétique

- Dark mode par défaut
- Typographie : **Inter** (UI) + **JetBrains Mono** (données chiffrées)
- Densité : haute mais respirée (Linear-like)
- Animations : subtiles et fonctionnelles, jamais décoratives
- Couleurs : palette neutre + accents signalétiques (vert validé, orange pending, rouge anomalie)

---

## Communication entre couches

```
[Frontend — servi par Nginx sur .59]
    ↕ (HTTPS + WebSocket)
[Backend API Express — .59 port 3010, PM2]
    ├─→ [Event Store Postgres — .59, à installer]
    ├─→ [MongoDB documents — .59 port 27017, déjà actif]
    ├─→ [Redis cache/queue — .59 port 6379, déjà actif]
    ├─→ [Agent Orchestrator]
    │       └─→ [Ollama DGX Spark .103] (HTTP 11434)
    ├─→ [Qdrant RAG — DGX Spark .103] (HTTP 6333)
    └─→ [Template Engine] (formulaires)
```

**Ports réseau Swigs .59 déjà utilisés** (pour éviter les collisions) :
- 3001 : swigs-cms-v3
- 3002 : swigs-task
- 3003 : swigs-workflow
- 3004 : ?
- 3005 : webify-backend
- 3006 : swigs-hub
- 3007 : reservetatable
- 3008 : swigs-calendar
- 3009 : ?
- **3010 : lexa-backend** ← réservé

**Event Bus Swigs Hub** (optionnel) pour recevoir `invoice.created`, `payment.received` depuis Swigs Pro et déclencher des événements d'ingestion dans Lexa.

---

## Décisions architecturales ouvertes

1. **Event store maison ou librairie ?** (pgboss / EventStoreDB / custom sur Postgres) → reco : **custom sur Postgres** pour v1, simple et suffisant
2. **Canvas library** → tranché : **react-flow** (déjà utilisé pour le LedgerCanvas dans `/workspace`) — tldraw hors scope V1
3. **Agent orchestrator : LangGraph, CrewAI, ou custom ?** → reco : **custom léger** (contrôle total, pas de dépendance lourde)
4. **Multi-tenant : schema-per-tenant ou shared schema + tenant_id ?** → reco : **shared schema + tenant_id** (RLS Postgres pour l'isolation)

## Décisions architecturales tranchées (session 02)

- **Serveur backend** : **192.168.110.59** (aux côtés des autres apps Swigs), port 3010, PM2, Node 20
- **Postgres** : à installer sur .59 (pas déjà présent — seul MongoDB, Redis et MySQL le sont)
- **Premier canton d'implémentation** : **Valais** (au lieu de Genève initialement proposé)
- **Validation fiduciaire externe** : en fin de développement uniquement, pas de consultant pendant le build (les agents experts IA tiennent le rôle)
- **Swiss GAAP RPC** : skippé en v1, à reconsidérer en v2 si un client beta en a besoin
