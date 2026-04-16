# NEXT SESSION — Point de reprise

**Dernière session** : [Session 33 — 2026-04-16](2026-04-16-session-33-integration-baremes.md) (Intégration barèmes officiels ICC 2026 — TaxScaleLoader, 8 YAML embarqués, 6 TODOs résolus, 0 régression qa-lexa)
**Prochaine session** : **Session 34 — Swissdec salaires (ingestion XSD + certificat salaire Form 11)**

> Session 32 a livré le mode fiduciaire complet : migration fiduciary_memberships (39 owners backfillés), MembershipService, JWT étendu (activeTenantId + memberships[]), POST /auth/switch-tenant, GET /fiduciary/clients, POST /fiduciary/invite, RLS préparée (migration 009 + queryAsTenant wrapper prêt), seed fiduciaire@lexa.test (2 memberships) + Acme SA GE, frontend switcher dropdown, +2 fixtures qa-lexa fiduciary (37/37). Score MVP ~99.3%.

---

## Ce qui marche après session 32

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | OK |
| Auth JWT + rate limit + trust proxy 1 | OK |
| **JWT étendu (S32)** | `activeTenantId + memberships[]` dans payload |
| **Agents actifs (14)** | classifier, reasoning, tva, fiscal-pp-vs/ge/vd/fr/ne/ju/bj, fiscal-pm, cloture, audit, conseiller |
| **Spark modèles** | 15 modèles lexa |
| **Mode fiduciaire (S32)** | |
| `POST /auth/switch-tenant` | **OK session 32** |
| `GET /fiduciary/clients` | **OK session 32** |
| `POST /fiduciary/invite` | **OK session 32** |
| Switcher dropdown dans header | **OK session 32** |
| `fiduciaire@lexa.test` avec 2 clients (demo + acme) | **OK session 32** |
| Isolation 403 (non-member switch) | **OK session 32** |
| **RLS** | Préparée (migration 009 + queryAsTenant prêt), inactive V1 |
| **Tests auto** | |
| qa-lexa **37/37** | **S32** |

---

## Session 33 — Objectif principal

### Option A (recommandée) : Swissdec salaires

- Ingestion standard XML Swissdec 5.0
- Générateur certificats salaire (formulaire officiel AFC)
- Source légale : LIFD art. 127 (attestation salaire)
- Modèle : lexa-salaire (16e modèle Spark)
- +2 fixtures qa-lexa → 39/39

### Option B : Polish préparation launch

- Code splitting React.lazy() — bundle 856KB → ~400KB
- RLS activation (migration queryAsTenant complète)
- Suppression DEV_BYPASS_AUTH apps
- Tests de charge

---

## Dettes identifiées (accumulées S32)

1. **RLS activation** : migration 009 préparée, queryAsTenant wrapper prêt → activer pre-launch après migration complète
2. **Bundle frontend** : 856 KB — code splitting React.lazy() (S33+ polish)
3. **Email invitation fiduciaire** : V2 (actuellement: grant via fixture seed uniquement)
4. **Audit log switches tenant** : V2
5. **Test de charge Ollama** : GPU contention Spark observée en S31-S32
6. **Käfer accountName complet** : 80 comptes hardcodés → jointure Qdrant (500 comptes)
7. **lexa-conseiller-test + lexa-fiscal-pp-fr-test** : supprimer de Spark
8. **Refresh ledger_entries** : MV doit être rafraîchie manuellement

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11-32)

1-50. (voir archives sessions précédentes)

51. **tenant_id users** : colonne est maintenant NULLABLE (ALTER TABLE S32) pour fiduciaires sans tenant propre
52. **fiduciaire@lexa.test** : UUID `00000000-0000-0000-0000-000000000100`, tenant_id NULL, memberships demo + acme
53. **ACME_TENANT_ID** : `00000000-0000-0000-0000-000000000101`, company Acme SA GE
54. **Switch-tenant** : valide membership DB (pas trust JWT seul) — sécurité en profondeur
55. **RLS V1** : inactive, isolation app-level via req.tenantId (JWT activeTenantId) suffit pour beta T4 2026

---

## Avertissements (héritage sessions 11-32)

1. `.env` prod jamais rsync
2. `trust proxy 1` ne pas retirer
3. qa-lexa **37/37 baseline** — si un test fail, investiguer avant push
4. HMAC Pro→Lexa : ne jamais JSON.stringify deux fois
5. JWT override req.tenantId — header X-Tenant-Id ignoré sur routes protégées
6. Disclaimer PDF/XML obligatoire
7. qwen3-vl-ocr sur Spark : output JSON non-déterministe, utiliser parseOcrModelOutput()
8. LEXA_ENABLED=true côté Pro : ne jamais passer à false
9. Backend = tsx watch src/ (pas dist compilé)
10. MONGO_URL = mongodb://127.0.0.1:27017
11. Rate limit login strict — utiliser http://localhost:3010 depuis serveur pour tests
12. Ollama images[] = PNG/JPEG uniquement — ne jamais envoyer PDF brut en base64
13. qa-lexa doit tourner sur `BASE_URL=http://localhost:3010` depuis .59
14. **Ollama create API** : utiliser `from` + `system` + `parameters` dans body JSON
15. **company_drafts** : table séparée de taxpayer_drafts
16. **seed-fixture-data** : DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000099"
17. **verify-citations** : filtre Qdrant sur `law` field + match exact article_num
18. **fiduciary fixtures qa-lexa** : `FIDU_EMAIL_QA = fiduciaire@lexa.test`, `FIDU_PASSWORD_QA = LexaFidu2026!`

19. **TaxScaleLoader** : chargement lazy des YAML au 1er appel → log `[TaxScaleLoader] loaded 8 scales`. Fallback auto sur approx V1 si scale absent ou confidence=low.
20. **qa-lexa seuils PM** : GE=25000, VD=25000, FR=30000 (post-barèmes officiels S33 — taux réels inférieurs aux approximations V1)
21. **barèmes PP** : taux marginal × revenu total (pas tranches classiques pour VS/GE/FR). VD utilise coefficient annuel 1.555.

**Dernière mise à jour** : 2026-04-16 (session 33 — barèmes officiels 2026, TaxScaleLoader, 0 régression qa-lexa)
