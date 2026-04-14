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

---

## Prochaine session

Voir [`NEXT-SESSION.md`](NEXT-SESSION.md) — **toujours à jour**.
