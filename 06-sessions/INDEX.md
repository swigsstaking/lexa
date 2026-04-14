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

---

## Prochaine session

Voir [`NEXT-SESSION.md`](NEXT-SESSION.md) — **toujours à jour**.
