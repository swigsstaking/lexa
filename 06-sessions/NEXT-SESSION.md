# NEXT SESSION — Point de reprise

**Dernière session** : [Session 17 — 2026-04-15](2026-04-15-session-17.md)
**Prochaine session** : Session 18 — Fiscal PM Sàrl/SA + Webhook retour Pro + Bilan

> Session 17 a livré le wizard PP Genève complet (clone session 15) et le
> profil contribuable persistant multi-year. 14/14 qa-lexa. Score MVP ~68.5%.

---

## Ce qui marche après session 17

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | ✅ |
| Auth JWT + rate limit + trust proxy 1 | ✅ |
| HMAC Pro→Lexa + classify auto | ✅ synthétique validé session 16 |
| **Wizard contribuable** | |
| Wizard PP VS 6 steps sur `/taxpayer/:year` | ✅ session 15 |
| **Wizard PP GE 6 steps sur `/taxpayer/ge/:year`** | ✅ **session 17** |
| Bouton "Déclaration PP" canton-aware (VS → /taxpayer, GE → /taxpayer/ge) | ✅ **session 17** |
| **Profil persistant** `taxpayer_profiles` (migration 006) | ✅ **session 17** |
| Auto-save profil à la génération + préremplissage step1 multi-year | ✅ **session 17** |
| **Knowledge base** | |
| Canton VS (339 articles) | ✅ |
| Canton GE (373 articles LIPP/LCP/LIPM) | ✅ session 16 |
| Qdrant `swiss_law` | 5761 pts |
| **Agents actifs** (5/7) | classifier, reasoning, tva, fiscal-pp-vs, fiscal-pp-ge |
| **Tests auto** | |
| qa-lexa **14/14** via HTTPS public | ✅ **session 17** (5 classify + 3 tva + 2 fiscal-pp-vs + 1 fiscal-pp-ge + **3 taxpayer**) |

---

## Priorité session 18 — ordre strict

### A. Webhook retour Lexa → Pro (~1h) — PRIORITÉ 1

Reporté sessions 14→15→16→17. Une fois classifiée, Lexa doit notifier Pro.

1. Côté Lexa : hook post-classification dans `routes/connectors.ts` qui POST vers `PRO_WEBHOOK_URL/api/bank/lexa-classification` avec HMAC `X-Pro-Signature`
2. Côté Pro : endpoint `POST /api/bank/lexa-classification` avec `requireHmac`
3. Nouveau secret `PRO_WEBHOOK_SECRET` partagé (openssl rand -hex 32)
4. Test : ingest → classify → vérifier callback Pro Mongo update

### B. Fiscal PM Sàrl/SA (~2h)

Premier formulaire fiscal personne morale.

1. `PmFormBuilder.ts` : projection bénéfice brut, provisions, amortissements
2. `PmPdfRenderer.ts`
3. Template YAML `pm-sarl-sa-2026.yaml`
4. Route POST /forms/pm-declaration
5. Wizard ou formulaire simplifié frontend

### C. Projections bilan + compte résultat (~1h)

Extension de VsPpFormBuilder/GePpFormBuilder pour inclure un bilan simplifié.

### D. Profile UI (~30 min)

Page "Mon profil" pour que l'utilisateur voie/modifie son profil persistant
sans passer par une déclaration complète.

### E. qa-lexa 15/15 + journal (~20 min)

Ajouter 1 fixture webhook Lexa→Pro ou PM.

---

## Règle de coupe session 18

**Noyau obligatoire** : A (webhook) + E (qa-lexa + journal).  
**Reportable** : B (fiscal PM) si A déborde 2h.  
**Ne pas toucher** : canvas, agents existants, KB, migrations existantes.

---

## Dettes reportées (ne pas traiter session 18 sauf gros creux)

- Refactor wizard multi-canton générique — session 19+ (attendre 3 cantons)
- Canton VD/FR/NE/JU/BE-Jura — sessions 19-23
- Annexes CO bilans fiscaux — session 19+
- Swissdec salaires — session 20+
- Mode fiduciaire multi-clients — session 20+
- Refresh tokens / email verification — session 21+
- Monitoring Prometheus / Grafana — session 22+
- Code-splitting frontend (JS bundle trop gros) — session 18+
- Validation XML eCH-0217 — session 19+
- Guide PP Genève explicite pour améliorer scores RAG GE — session 18+

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→17)

1. Canvas → react-flow définitif
2. Dark mode → livré session 11
3. Multi-tenant isolation par JWT → req.tenantId override
4. Autonomie IA → validation humaine obligatoire
5. Langue v1 → FR uniquement
6. Auth → JWT simple HS256 7d, bcryptjs cost 12
7. Deploy → `lexa.swigs.online` Let's Encrypt
8. Webhook Pro↔Lexa → HMAC SHA256 timing-safe
9. PDF → pdfkit backend
10. Template forms → YAML canonique + copie runtime embed
11. Helpers execution mutualisés → `shared.ts`
12. Idempotence par formKind
13. Un YAML + un Builder par formulaire
14. Un Modelfile par canton
15. qa-lexa baseline de régression → **14/14** après session 17
16. HMAC service-to-service strictement séparé du JWT
17. Un draft par tenant par année fiscale
18. State wizard en JSONB flexible, mutation atomique par dot-path
19. `app.set('trust proxy', 1)` obligatoire
20. Source canonique KB cantonale : HTML statiques officiels
21. Re-ranking agent cantonal : tier 0 sources cantonales PP
22. Observation cron = filet optionnel, synthetic suffit
23. **Cloner plutôt que factoriser en v1 (avant 3 cantons)** — session 17
24. **Backend tourne via `tsx watch src/` — rsync doit cibler src/, pas dist/**
25. **PATCH profile auto-save non-bloquant** — erreur catchée silencieusement

---

## Avertissements (héritage sessions 11-17)

1. **`.env` prod jamais rsync**
2. **`trust proxy 1`** ne pas retirer
3. **qa-lexa 14/14 baseline** — si un test fail, investiguer avant push
4. **HMAC Pro→Lexa** : ne jamais JSON.stringify deux fois
5. **JWT override req.tenantId** — header `X-Tenant-Id` ignoré sur routes protégées
6. **Disclaimer PDF/XML obligatoire**
7. **deepseek-ocr sur Spark** : ne jamais décharger avec keep_alive=0
8. **LEXA_ENABLED=true côté Pro** : ne jamais passer à false
9. **Backend = tsx watch src/** (pas dist compilé) — découvert session 17
10. **Templates YAML dans src/execution/templates/** — copier dans src lors du rsync

---

**Dernière mise à jour** : 2026-04-15 (fin session 17 — wizard GE + profil persistant)
