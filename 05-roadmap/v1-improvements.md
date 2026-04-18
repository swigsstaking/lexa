# Lexa V1+ — Roadmap d'améliorations

**Version actuelle** : V1.0 beta fermée (Sessions 1-4 livrées 2026-04-17)
**Source de vérité fonctionnelle** : `00-vision/whitepaper.md` V0.2

---

## V1.0 — Livré (beta fermée)

### Backend

- **Event-sourcing Postgres** — event store + matview `ledger_entries` (refresh manuel requis post-CAMT import — voir `memory/gotcha_ledger_view.md`)
- **Multi-tenant RLS 4/4** — `fiduciary_memberships`, isolation par `tenant_id`, RLS Postgres vérifié (Lane C + Lane F)
- **Ingestion CAMT.053** — parser + endpoint `POST /connectors/camt053/upload`, 55 tx en smoke test Round 3B (commit `0fc76cc`)
- **Classifier IA vLLM NVFP4** — Qwen3.5-35B-A3B, 86% Käfer sur 100 écritures PM GE, ~2-6 s/tx (commit `c8cb61a` + `5d8ad21`)
- **Classification déterministe events Pro** — bypass LLM pour tous les events Swigs Pro (commit `4557196`)
- **Dedup fingerprint cross-source** — normalisation descriptif CAMT↔Pro, migration 018 (commit `ef5a35b` + `bd86d17`)
- **Agents IA — 14 actifs** : Classifier, Audit, Briefing Conseiller, Clôture, TVA, OCR, RAG, Fiscal-PP/PM × 4 cantons, Swissdec
- **Audit IA** — 76 s sur tenant vide, citations LIFD/LHID (Round 3B)
- **Briefing Conseiller** — cron 6h, ~30 s avec citations (commit `0106d2a`)
- **Queue LLM BullMQ** — 0 timeout sous charge, erreurs mappées HTTP 504/502/500 (Lane D, commit `apps/backend/src/services/LlmQueue.ts`)
- **eCH-0119 XML** — export déclaration PP VS (commit `99ad1a2`, artifact `round-3a-artifacts/declaration-pp-vs.xml`)
- **eCH-0229 XML** — export déclaration PM GE, tous champs validés (Round 3B, artifact `declaration-pm.xml`)
- **8 wizards fiscaux** — 4 PP (VS, GE, VD, FR) + 4 PM (VS, GE, VD, FR), PDF + estimateur fiscal
- **Bridge Swigs Pro** — ingestion events `invoice.*` / `payment.*` / `expense.*`, HMAC <100 ms, idempotence (commit `c894d6a` + `ca200ae`)
- **Email forward IMAP** — import emails Infomaniak avec token par tenant (commit `d4f3531`)
- **OCR pipeline** — upload PDF, extraction champs, confiance, bouton "Pré-remplir wizard" (Round 3B parcours 2)
- **QR-facture** — parsing factures QR suisses (Lane J)
- **Swissdec Form 11** — salaires (session 34)
- **Barèmes ICC** — intégration barèmes intercantonaux (Lane B, session 33)
- **Clôture continue** — santé comptable, alertes déséquilibre + amortissements manquants (Round 3B)
- **Cache HTTP no-store** — middleware global sur routes sensibles (Lane D, `noCache.ts`)
- **No-cache fiduciary/clients** — correction fuite session après switch (commits `9c1211d` + `cad4eaf`)

### Frontend

- **Grand livre visuel** — `LedgerCanvas` flux G→D, classes Käfer, collapse auto >50 comptes (commits `da9db48` + `f02cde9`)
- **LedgerDrawer** — détail écritures, soldes filtrés par période (commit `23075f8`, Lane O tâche 1)
- **Timeline fiscale** — bouton période, modal filtre, curseur jour J, track gris/période verte (commits `c9f2637` + `26b9472`)
- **Workspace mobile** — groupes Käfer, touch targets 44px partout (commits `4979a2d` + `0fe5f4e`)
- **Badge fiduciaire** — switcher client dans badge company, isolation multi-tenant UI (commit `0c373c5`)
- **Mode fiduciaire** — switcher PP↔PM opérationnel, badge `tenant actif` persistant dans header (commits `b93dccf` + `8c41224`)
- **Welcome + empty state** — route `/welcome` post-inscription, `StartActionCards` 3 CTAs PP/PM×canton (commits `45241b3` + `a3360c9`)
- **Documents** — drag&drop upload, section CAMT.053, section OCR, création écriture depuis OCR (commits `3f3db28` + `0fc76cc`)
- **i18n fr** — clés `welcome.*`, `workspace.empty.*` complets
- **Ratios métier** — bandeau CA/Marge/Trésorerie/Charges (commit `215c343`)
- **Formes juridiques** — liste complète suisse dans `LegalForm` (commit `75edaa5`)
- **Fix onboarding Tab** — submit prématuré bloqué (commit `0b273f9`)

### Infra

- **Serveurs** : backend + PG sur `.59`, vLLM/Qdrant/Ollama/embedder sur `.103`
- **Deploy** : rsync frontend vers `/home/swigs/lexa-frontend/` (jamais `.env`)
- **Pont Pro cron** : sync events :30 min
- **vLLM NVFP4 Avarok marlin** — décision retenue vs Ollama natif (18× speedup mesuré, commit `c8cb61a`)
- **Migrations** : 018 (fingerprint cross-source), 017 (schema_migrations tracking), 012 (account_balance VIEW)

---

## V1.1 — Quick wins (3-6 semaines)

Priorité : items P1 trouvés en QA + UX urgent. Sources : `06-sessions/2026-04-17-mobile-bugs-backlog.md`, `06-sessions/round-3b-artifacts/rapport-round-3b.md`, `06-sessions/2026-04-16-lane-f-regression-report.md`.

### Bug fixes critiques

- [ ] **BUG-MOB-01** : `PeriodModal` inaccessible sur mobile — déplacer de `LedgerCanvas.tsx` (ligne 222, masqué `hidden md:block`) vers `Workspace.tsx` ou `App.tsx` comme portal — effort ~30 min
- [ ] **BUG-MOB-02** : `LedgerModal` header dense en 375px — séparer en 2 lignes `flex-col sm:flex-row`, masquer labels via `hidden sm:inline` — effort ~25 min
- [ ] **BUG-MOB-04** : Timeline bouton touch-target 40px (< WCAG 44px) — augmenter container à `h-[68px]`, bouton à `h-12` ou `padding-y` transparent — effort ~10 min (attention layout flex-col)
- [ ] **BUG-MOB-03** : Switcher fidu non testable sans fixture multi-tenant — ajouter seed QA multi-membership — effort ~45 min
- [ ] **Wizard PM — draft non restauré** : champs Step 1 vides au rechargement — `loadOrCreateDraft()` ne hydrate pas les composants Step depuis `draft.state` (Round 3B P1)
- [ ] **Régression BUG-P1-02-B** : formulaire Step 1 PM GE affiche encore "canton du Valais" + communes VS (Lane F résidu)
- [ ] **IFD live vs PDF** : écart IFD live 5 442 ≠ IFD PDF 1 690 sur PM VS (Lane F ⚠️ P2-04) — vérifier calcul `simulateFiscal` vs générateur PDF
- [ ] **Drill-down pièce justificative** — ajouter `documentId?: string` sur `LedgerEntry` backend + `api/types.ts` + icône `Paperclip` dans `LedgerDrawer.tsx` (Lane O tâche 3, ~1h30 total)
- [ ] **Dedup fuzzy cross-source CAMT↔Pro** — Levenshtein/TF-IDF + extraction regex numéro facture depuis refs CAMT — KNOWN LIMIT Round 4D (commit `bd86d17` couvre normalisation mais pas cross-source précis)
- [ ] **Mobile workspace re-test** PP/PM/Fidu en 375px après fix MOB-01 + MOB-02

### Features V1.1

- [ ] **Tag "Swigs Pro"** sur les imports Pro dans `/documents` — badge visuel distinct des uploads OCR
- [ ] **Toggle sync Pro côté Lexa** — Settings → Intégrations → Pro (activer/désactiver le bridge par tenant)
- [ ] **Toggle sync visible UI Pro** — déjà codé côté Pro, vérifier deploy frontend Pro avant annonce
- [ ] **Briefing Conseiller enrichi** — suggestions proactives de déductions + simulations simples IR (base cron existant commit `0106d2a`)

### Spec édition graph (à figer avant dev)

Feature : édition écritures depuis le grand livre visuel (`LedgerCanvas`).

- Right-click node ledger → context menu : **Modifier / Lettrer / Corriger**
- Sélection multi-nœuds (Cmd+click) → bouton "Lettrer" en barre flottante
- Anomalie audit IA → bouton "Corriger" → jump auto sur le nœud + drawer édition
- **Backend** :
  - Event `TransactionCorrected` ajouté au type union event-sourcing
  - Endpoint `PATCH /events/:streamId/correct`
  - Endpoint `POST /lettrage` (lettrage comptable)
  - Preserve event-sourcing — jamais de mutation directe de l'event store
- **Frontend** :
  - Context menu sur node react-flow (à évaluer : portail ou inline)
  - Audit trail Cmd+Z via event inverse `CorrectionReverted`
  - Barre flottante multi-sélection
- Effort estimé : ~2-3 jours backend + frontend

---

## V1.2 — Consolidation (2-3 mois)

### Tests & qualité

- [ ] Tests E2E mobile complets — 3 personas (PP, PM, Fidu) en 375px après fix V1.1
- [ ] Suite de tests IA automatisée — latence, qualité classification, coût token — en CI
- [ ] 5-10 fiduciaires beta réels — feedback en boucle courte, cantons VS + GE en priorité
- [ ] Test de charge — 100+ clients par fiduciaire (objectif `milestones.md` T3 2027 anticipé)
- [ ] Régression cross-browser — Safari mobile (WebKit) + Firefox

### Features V1.2

- [ ] **Réconciliation visuelle** — edge "Réconcilié" entre nœud paiement et nœud facture dans le graph (base pont Pro `e07158d` qui mappe déjà paiement↔facture)
- [ ] **OCR LPP rachat type explicit** — mapping P1 identifié en Round 3A (attestation 3A mapping partiel)
- [ ] **Hydratation wizard step 3-6** — audit complet steps 3-6 PP/PM (rounds 3A+3B couvraient step 1-2 surtout)
- [ ] **Workflow approbation notes de frais** — côté Pro : manager peut approuver/refuser avant ingestion dans Lexa
- [ ] **Timeout UI agent** — afficher spinner + message "Analyse en cours…" pendant appel LLM long (LlmQueueTimeoutError HTTP 504 reçu mais pas rendu user-friendly — Lane F P3-01 résidu ⚠️)
- [ ] **Empty state mobile** — `StartActionCards` visible sur mobile (actuellement `md:grid` uniquement, cohérent avec LedgerCanvas mais à ouvrir)
- [ ] **i18n EN** — clés `welcome.*` et `workspace.empty.*` en anglais (non bloquant, `fr` fallback configuré)
- [ ] **Onboarding step 2-6 PP** — compléter hydratation auto depuis OCR (cert salaire + attestation 3A)

---

## V2 — Backlog horizon (T3 2026+)

Reprend `05-roadmap/milestones.md` T5-T8 et ajoute les items identifiés en QA.

### Cantons & fiscal

- [ ] Cantons supplémentaires — VD, FR, NE, JU, BE-Jura (au-delà des 7 SR initiaux)
- [ ] Cantons alémaniques — ZH, BE, AG, SG
- [ ] Multi-langue — DE, IT
- [ ] eCH-0211 TVA déclaration électronique (ePortal AFC)
- [ ] Agent Fiscal-PM complet — bénéfice imposable, corrections fiscales, capital imposable (milestones T2 2027)
- [ ] Clôture continue enrichie — détection auto anomalies, rapport de gestion CO 961c (milestones T1 2027)

### Intégrations

- [ ] eBanking direct (Open Banking / PSD2-équivalent CH)
- [ ] Intégration Bexio / Abacus / Sage — import-export
- [ ] Swissdec complet — envoi certificats de salaire + décomptes AVS/AI/APG (milestones T3 2027)
- [ ] Délégation client — lien sécurisé pour validation par le client final

### Infrastructure & UX

- [ ] **Canvas spatial** — reporté V2 (décision 2026-04-16, commit `ffde87d`) — évaluation react-flow vs tldraw sur use case compta
- [ ] App mobile native — PWA d'abord, React Native ensuite
- [ ] Mode offline avec sync
- [ ] Voice interface — briefing vocal TTS local
- [ ] Dashboard multi-clients fiduciaire — alertes, délégation, facturation interne via Swigs Pro (milestones T3 2027)

---

## Annexes

### Bugs P2/P3 reportés (non bloquants V1)

| ID | Description | Source | Effort estimé |
|----|-------------|--------|---------------|
| BUG-MOB-01 | PeriodModal inaccessible sur mobile | `2026-04-17-mobile-bugs-backlog.md` | ~30 min |
| BUG-MOB-02 | LedgerModal header dense 375px | `2026-04-17-mobile-bugs-backlog.md` | ~25 min |
| BUG-MOB-03 | Switcher fidu — fixture multi-tenant QA manquante | `2026-04-17-mobile-bugs-backlog.md` | ~45 min |
| BUG-MOB-04 | Timeline touch-target 40px (WCAG 44px) | `2026-04-17-mobile-bugs-backlog.md` | ~10 min |
| BUG-P1-02-B | Formulaire Step 1 PM GE liste communes VS | `lane-f-regression-report.md` | ~30 min |
| BUG-P2-04 | IFD live ≠ IFD PDF (écart ~3 750 CHF) | `lane-f-regression-report.md` | à investiguer |
| BUG-P3-01 | Timeout UI agent absent (HTTP 504 silencieux) | `lane-f-regression-report.md` | ~1h |
| DETTE-O-3 | Drill-down pièce justif — `documentId` absent | `lane-o-v1-dettes.md` | ~1h30 |

### Métriques V1 mesurées

| Métrique | Valeur | Source |
|----------|--------|--------|
| Classifier vLLM NVFP4 | ~2-6 s/tx | Round 3B + commit `c8cb61a` |
| Classifier Käfer PM GE | 86% (86/100 tx) | Round 3B `rapport-round-3b.md` |
| Audit IA (tenant vide) | 76 s | Round 3B |
| Briefing Conseiller | ~30 s avec citations LIFD/LHID | Round 3C |
| Bridge HMAC ingestion | <100 ms | Round 4D smoke |
| OCR upload → extraction | ~201 ms (pdf-parse, 14 champs) | Lane F parcours 2 |
| Score E2E général | 8.5/10 (avant vague 2 : 7/10) | Lane F |

### Décisions techniques V1

| Décision | Choix retenu | Raison |
|----------|-------------|--------|
| LLM runtime | vLLM NVFP4 (Avarok marlin) | 18× speedup vs Ollama natif (commit `c8cb61a`) |
| Persistance | Event-sourcing PG + matview `ledger_entries` | Audit trail, undo, multi-tenant |
| Dedup | Fingerprint descriptif normalisation | KNOWN LIMIT : cross-source précis non résolu (commit `bd86d17`) |
| Classification events Pro | Déterministe (bypass LLM) | Perf + déterminisme (commit `4557196`) |
| Multi-tenant | `fiduciary_memberships` + RLS | Pattern éprouvé Swigs Pro |
| Canvas spatial | Reporté V2 | Scope V1 grand livre visuel + wizards (commit `ffde87d`) |
| Frontend | React + Vite + TanStack Query | Cache invalidation post-import, requêtes typées |
