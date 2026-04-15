# Sessions Lexa — Index

Historique chronologique des sessions de travail.

**Règle** : chaque session doit se conclure par :
1. La création de `YYYY-MM-DD-session-NN.md` (journal complet)
2. La mise à jour de `NEXT-SESSION.md` (point de reprise pour la suivante)
3. Si décision structurelle : mise à jour de `00-vision/whitepaper.md`
4. Si avancement concret : mise à jour de `05-roadmap/milestones.md`

---

## Sessions

| # | Date | Durée | Thème | Livrables | Doc |
|---|---|---|---|---|---|
| 01 | 2026-04-13 | ~2h | Fondations documentaires, choix du nom, audit prototype Spark, création de l'arborescence | Whitepaper v0.1, archi v0.1, roadmap 24 mois, KB index, docs de relais | [lien](2026-04-13-session-01.md) |
| 02 | 2026-04-14 | ~1h30 | Décisions user (7 questions), setup Git + GitHub, inspection .59, ingestion LHID | Docs mis à jour avec décisions (VS en premier canton, backend .59:3010), git init + push, 108 articles LHID → Qdrant (791→899 pts) | [lien](2026-04-14-session-02.md) |
| 03 | 2026-04-14 | ~2h30 | Ingestion massive : 15 docs AFC (Notice A + 14 circ IFD) + 4 docs Valais (Guide PP 2024, barème 2026, déductions, impôt source) | Scripts `ingest_afc_pdfs_lexa.py` + `ingest_vs_pdfs_lexa.py`, +1880 AFC + 228 VS → **3007 pts**, 10/10 tests RAG OK | [lien](2026-04-14-session-03.md) |
| 04 | 2026-04-14 | ~3h | LP + CSI 28 + Loi fiscale VS via Playwright. Installation Playwright+Chromium. Tentatives Postgres (password refusé) et Info TVA (JSF complexe, reporté) | +397 LP + 479 CSI + 175 VS-LF → **4058 pts**. Playwright validé sur lex.vs.ch (Cloudflare bypass) | [lien](2026-04-14-session-04.md) |
| 05 | 2026-04-14 | ~3h | Postgres 14 installé, parser VS fix (175→339 articles), OIFD+OLTVA+OIA+ORC via SPARQL subagent, Info TVA 4 publications via flow JSF PDF | +164 VS +448 ordonnances +652 Info TVA → **5322 pts**. Tests RAG Info TVA jusqu'à 0.778 (record) | [lien](2026-04-14-session-05.md) |
| 06 | 2026-04-14 | ~3h30 | **PIVOT MAJEUR** : scaffold backend Lexa (TypeScript + Express + Postgres event store + micro-service BGE-M3 + RAG pipeline + ClassifierAgent). Deployed sur .59:3010 via PM2 | Backend en production, 5 services verts, premier RAG /rag/ask validé end-to-end (Art. 10 al. 2 let. a LTVA) | [lien](2026-04-14-session-06.md) |
| 07 | 2026-04-14 | ~4h | **OPTIMISATION MASSIVE** : config Ollama (KV q8_0, NUM_PARALLEL=1), Modelfile `lexa-classifier` JSON, BGE-M3 sur GPU via llama.cpp (build sm_121a), event-sourced flow POST /transactions, plan Käfer 66 comptes, systemd lexa-llama-embed | `/rag/ask` 797s→43s (18×), `/transactions` 9.8s end-to-end, BGE-M3 ×200, Käfer ingéré (5388 pts) | [lien](2026-04-14-session-07.md) |
| 08 | 2026-04-14 | ~2h | Modelfile `lexa-reasoning` (`/rag/ask` → 7.4s, 108× vs initial), projection Grand Livre (materialized view + /ledger/balance), connecteur Swigs Pro `POST /connectors/bank/ingest` (compatible format BankTransaction) | 14 events, 7 comptes, balance équilibrée 13'103.80 CHF, MVP fonctionnellement complet | [lien](2026-04-14-session-08.md) |
| 09 | 2026-04-14 | ~2h | Agent TVA dédié (lexa-tva), onboarding UID register BFS (Lexa indépendante), hook Swigs Pro non-bloquant (flag LEXA_ENABLED), migration 003 companies | 10 routes backend, 3 agents, search company 278ms, Lexa 100% indépendante, Pro→Lexa bridge installé | [lien](2026-04-14-session-09.md) |
| 10 | 2026-04-14 | ~1h30 | **FRONTEND** : scaffold React 19 + Vite 8 + Tailwind 3.4, routing + AppShell, onboarding wizard 4 étapes (framer-motion), dashboard + ledger + chat 3 agents, activation live du pont Pro→Lexa | 18 fichiers TS/TSX, 5 routes, build 465KB, proxy Vite /api validé, tsc clean | [lien](2026-04-14-session-10.md) |
| 11 | 2026-04-14 | ~3h | **PIVOT UX WHITEPAPER** : refactor complet du scaffold pour alignement §5 Interface — workspace canvas spatial (react-flow nodes Käfer + edges animées), chat cmd+k overlay portal, dark mode CSS vars sémantiques (Inter + JetBrains Mono), multi-tenant middleware backend + store pluriel, i18next FR zero hardcoded, timeline fiscale 60px, Ledger en toggle mode expert, fix onboarding shape, fix eCH-0097 swigs-workflow commit dédié | /workspace unique route, 7 nodes + 7 edges rendu, chat/ledger portals, smoke tests E2E chrome-devtools OK | [lien](2026-04-14-session-11.md) |
| 12 | 2026-04-14 | ~3h | **EXECUTION LAYER v1** : décompte TVA AFC trimestriel bout en bout — template YAML déclaratif `01-knowledge-base/forms/` (whitepaper §3 couche 4), `TvaFormBuilder` projection events TransactionClassified par trimestre, `POST /forms/tva-decompte` + audit event `DeclarationGenerated`, PDF pdfkit avec disclaimer Lexa obligatoire, XML eCH-0217 minimal v1 `status="draft"`, button + download blob dans LedgerModal. 4 fixes UX post-audit (P1 MiniMap / P2 flicker / P3 skeleton / P4 a11y). Smoke tests backend HTTP 200, solde seed Q2 2026 = -468.61 CHF | Layer 4 passe de 0% à v1 fonctionnel, premier artefact comptablement exploitable | [lien](2026-04-14-session-12.md) |
| 13 | 2026-04-15 | ~5h | **EXECUTION PROFONDEUR** : 3 nouveaux formulaires officiels bout en bout (TVA annuel récapitulatif art. 72 LTVA, TVA TDFN art. 37 avec 21 secteurs + select UI, déclaration fiscale PP Valais PDF). Nouvel agent `lexa-fiscal-pp-vs` (4e modèle Lexa, re-ranking VS-Guide-PP/VS-Deductions/LIFD). Refactor `execution/shared.ts` helpers mutualisés. Idempotence mutualisée via `findExistingDeclaration` + helper `finalizeForm` (résout dette session 12 — 2e click = event réutilisé). Script `qa-lexa` 10 fixtures 10/10 pass (baseline latences : classify 30s / tva 9s / fiscal-pp 13.4s). Fix bug critique RAG : `EMBEDDER_URL :8001 → :8082` (uvicorn ancien vs llama-server OpenAI-compat), invisible car health probe superficielle. 9 events `DeclarationGenerated` dans l'event store. Frontend : toggle trimestriel/annuel + select secteur TDFN + bouton secondaire "Décl. PP VS" | Layer 4 passe de ~15% à ~30%, premier formulaire fiscal direct (VS-PP), script de régression en place, bug embedder réparé | [lien](2026-04-15-session-13.md) |

---

## Prochaine session

Voir [`NEXT-SESSION.md`](NEXT-SESSION.md) — **toujours à jour**.
