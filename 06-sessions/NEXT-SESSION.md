# NEXT SESSION — Point de reprise

**Dernière session** : [Session 31 — 2026-04-16](2026-04-16-session-31.md) (Agent Conseiller — 7e et dernier rôle whitepaper, TaxSimulator, /conseiller/:year, 14 agents actifs, qa-lexa 35/35)
**Prochaine session** : **Session 32 — Swissdec salaires OU mode fiduciaire multi-clients**

> Session 31 a livré le 7e et dernier rôle whitepaper (Agent Conseiller), le 15e modèle Spark (lexa-conseiller), TaxSimulator (simulateRachatLpp + simulatePilier3a + simulateDividendVsSalary), 3 endpoints /simulate/*, la page /conseiller/:year avec 3 cards simulations et le chat agent, +2 fixtures qa-lexa (35/35). Score MVP ~99%.

---

## Ce qui marche après session 31

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | OK |
| Auth JWT + rate limit + trust proxy 1 | OK |
| **Agents actifs (14)** | classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/ne/ju/bj, fiscal-pm, cloture, audit, **conseiller** |
| **Spark modèles** | 15 modèles lexa (+ 1 test intermédiaire = 16) |
| **Routes simulate** | |
| `POST /simulate/rachat-lpp` | **OK session 31** |
| `POST /simulate/pilier-3a` | **OK session 31** |
| `POST /simulate/dividend-vs-salary` | **OK session 31** |
| **Agent Conseiller** | |
| `POST /agents/conseiller/ask` | **OK session 31** |
| `/conseiller/:year` — 3 cards simu + briefing + chat | **OK session 31** |
| Bouton "Conseiller" (Lightbulb) dans Workspace | **OK session 31** |
| **Tests auto** | |
| qa-lexa **35/35** | **S31** |

---

## Session 32 — Options

### Option A (recommandée) : Swissdec salaires

- Ingestion standard XML Swissdec 5.0
- Générateur certificats salaire (formulaire officiel AFC)
- Source légale : LIFD art. 127 (attestation salaire)
- Modèle : lexa-salaire (16e modèle Spark)
- +2 fixtures qa-lexa → 37/37

### Option B : Mode fiduciaire multi-clients

- Refactor multi-tenant profond avec RLS Postgres
- Interface fiduciaire : vue multi-clients, switch company, rapports consolidés
- Source légale : CO art. 959 (comptabilité séparée)

---

## Dettes identifiées (accumulées)

1. **Käfer accountName complet** : 80 comptes hardcodés → jointure Qdrant (500 comptes)
2. **Détection écritures manquantes avancée** : provisions, accruals, cohérence inter-exercices
3. **Génération annexe CO 959c** (PDF structuré)
4. **Refresh ledger_entries** : MV doit être rafraîchie manuellement
5. **DEV_BYPASS_AUTH** : plusieurs apps — à retirer avant launch
6. **Bundle frontend** : ~854 KB — code splitting à implémenter avant launch
7. **lexa-conseiller-test + lexa-fiscal-pp-fr-test** : supprimer de Spark (modèles intermédiaires)
8. **Simulator achat véhicule / embauche** : V2 — non implémenté S31

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11-31)

1-39. (voir archives sessions précédentes)

40-45. (voir NEXT-SESSION S30)

46. **TaxSimulator** : réutilise estimateTaxDue() de taxEstimator.ts — ne pas dupliquer les barèmes
47. **simulateDividendVsSalary** : réduction 60% uniquement si participation qualifiée ≥10% — assumption explicite dans disclaimer
48. **Taux AVS 2026** : employé 6.35% (5.3 AVS + 1.0 AI + 0.05 APG), employeur 6.45% (+ 0.10 AC)
49. **GE dividende** : IS PM GE 14% → souvent salaire plus avantageux qu'ailleurs pour marginal <35%
50. **lexa-conseiller** : créé via API Ollama `from` + `system` + `parameters` (identique lexa-audit)

---

## Avertissements (héritage sessions 11-31)

1. `.env` prod jamais rsync
2. `trust proxy 1` ne pas retirer
3. qa-lexa **35/35 baseline** — si un test fail, investiguer avant push
4. HMAC Pro→Lexa : ne jamais JSON.stringify deux fois
5. JWT override req.tenantId — header X-Tenant-Id ignoré sur routes protégées
6. Disclaimer PDF/XML obligatoire
7. qwen3-vl-ocr sur Spark : output JSON non-déterministe, utiliser parseOcrModelOutput()
8. LEXA_ENABLED=true côté Pro : ne jamais passer à false
9. Backend = tsx watch src/ (pas dist compilé)
10. Templates YAML dans src/execution/templates/
11. MONGO_URL = mongodb://127.0.0.1:27017
12. Rate limit login strict — utiliser http://localhost:3010 depuis serveur pour tests
13. Ollama images[] = PNG/JPEG uniquement — ne jamais envoyer PDF brut en base64
14. qa-lexa doit tourner sur http://127.0.0.1:3010 depuis .59
15. **Ollama create API** : utiliser `from` + `system` + `parameters` dans body JSON
16. **company_drafts** : table séparée de taxpayer_drafts
17. **seed-fixture-data** : DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000099"
18. **verify-citations** : filtre Qdrant sur `law` field + match exact article_num

**Dernière mise à jour** : 2026-04-16 (session 31 — Agent Conseiller, 15 modèles Spark, 14 agents, /conseiller/:year, 35/35 qa-lexa)
