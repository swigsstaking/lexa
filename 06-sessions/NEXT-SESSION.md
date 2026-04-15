# NEXT SESSION — Point de reprise

**Dernière session** : [Session 19 — 2026-04-15](2026-04-15-session-19.md)
**Prochaine session** : Session 20 — Ingestion Fribourg (FR) OU Webhook retour Lexa→Pro — au choix de la mère

> Session 19 a livré le wizard contribuable PP Vaud complet (6 steps, `/taxpayer/vd/:year`),
> le backend VdPpFormBuilder + VdPpPdfRenderer + 2 routes, et qa-lexa **16/16**. Score MVP ~70%.

---

> **Recommandation pour session 20 (2 options — mère décide) :**
>
> **Option A : Ingestion Fribourg (FR)** — Clone du pattern VD/GE. Source FR : legislation.fr.ch ou Legifer FR (BLV fribourgeois). Livrable : agent `lexa-fiscal-pp-fr`, KB FR dans Qdrant, +qa fixtures, wizard PP FR session 21.
>
> **Option B : Webhook retour Lexa→Pro** — Notifier swigs-workflow quand une déclaration est générée. Payload HMAC, route `/api/webhooks/lexa-declaration` côté Pro, store dans `declarations` table Pro.

---

## Ce qui marche après session 19

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | ✅ |
| Auth JWT + rate limit + trust proxy 1 | ✅ |
| HMAC Pro→Lexa + classify auto | ✅ synthétique validé sessions 16+18 |
| **Wizard contribuable** | |
| Wizard PP VS 6 steps sur `/taxpayer/:year` | ✅ session 15 |
| Wizard PP GE 6 steps sur `/taxpayer/ge/:year` | ✅ session 17 |
| **Wizard PP VD 6 steps sur `/taxpayer/vd/:year`** | ✅ **session 19** |
| Bouton "Déclaration PP" canton-aware (VS/GE/VD) | ✅ session 19 |
| Profil persistant `taxpayer_profiles` (migration 006) | ✅ session 17 |
| **Knowledge base** | |
| Canton VS (339 articles) | ✅ |
| Canton GE (373 articles LCP/LIPP/LIPM) | ✅ session 16 |
| Canton VD (381 articles LI/LIPC/RLI) | ✅ session 18 |
| Qdrant `swiss_law` | **6142 pts** |
| **Agents actifs** (6/7) | classifier, reasoning, tva, fiscal-pp-vs, fiscal-pp-ge, fiscal-pp-vd |
| **Tests auto** | |
| qa-lexa **16/16** via HTTPS public | ✅ **session 19** (5 classify + 3 tva + 2 fiscal-pp-vs + 1 fiscal-pp-ge + 1 fiscal-pp-vd + 4 taxpayer) |

---

## Priorité session 19 — ordre strict

### Recommandation mère : Wizard VD-PP d'abord (parité avec GE)

**Option A : Wizard contribuable PP Vaud (~3h) — PRIORITÉ RECOMMANDÉE**

Répéter le pattern session 17 (clone GE wizard) pour VD. Le backend a déjà tout : agent `lexa-fiscal-pp-vd`, KB ingérée. Il manque :

1. `VdPpFormBuilder.ts` : clone GePpFormBuilder, constantes VD (frais pro min 2000, pilier3a 7260)
2. `VdPpPdfRenderer.ts` : clone GePpPdfRenderer, header "Déclaration d'impôt PP Vaud — 2026"
3. Template YAML `vd-declaration-pp-2026.yaml`
4. Route `POST /forms/vd-declaration-pp` + `POST /taxpayers/draft/submit-vd`
5. Frontend `TaxpayerWizardVd.tsx` + 6 steps VD + routing `/taxpayer/vd/:year`
6. Communes VD (Lausanne, Lausanne, Yverdon-les-Bains, Montreux, Renens, Nyon, Prilly, etc.)
7. Bouton "Déclaration PP" étendu à VD dans Workspace.tsx

**Option B : Ingestion Fribourg (FR) — Session 20 si A livré**

Clone du pattern VD/GE. Source FR : legislation.fr.ch ou Legifer FR. À déléguer à un subagent Explore comme session 16 et 18.

---

## Décision de coupe session 19

**Noyau obligatoire** : Wizard VD-PP (frontend 6 steps + backend FormBuilder + PDF + route) ou Ingestion FR.  
**Reportable** : Webhook retour Lexa→Pro (reporté sessions 14→19).  
**Ne pas toucher** : agents existants, KB déjà ingérée, Modelfiles existants.

---

## Dettes reportées (ne pas traiter session 19 sauf gros creux)

- Ingestion FR, NE, JU, BE-Jura — sessions 20-23
- Fiscal PM Sàrl/SA — session 19 ou 20
- Webhook retour Lexa → Pro — session 20
- Guide PP VD (langage courant) pour améliorer RAG brut 2/5 → 4/5 — session 20+
- Autres règlements VD (642.11.2, 642.11.3, 642.11.4) — session 20+
- Projections bilan + compte résultat — session 20
- Refactor wizard générique multi-canton — session 21 (quand 3 wizards : VS, GE, VD)
- Annexes CO bilans fiscaux — session 21
- Mode fiduciaire multi-clients — session 22+
- Bug mapping eCH-0097 côté swigs-workflow — commit dédié 15 min quand creux

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→18)

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
15. qa-lexa baseline de régression → **16/16** après session 19
16. HMAC service-to-service strictement séparé du JWT
17. Un draft par tenant par année fiscale
18. State wizard en JSONB flexible, mutation atomique par dot-path
19. `app.set('trust proxy', 1)` obligatoire
20. Source canonique KB cantonale : HTML statiques officiels (ou API REST si SPA)
21. Re-ranking agent cantonal : tier 0 sources cantonales PP
22. Observation cron = filet optionnel, synthetic suffit
23. **Cloner plutôt que factoriser en v1 (avant 3 cantons)** — session 17
24. **Backend tourne via `tsx watch src/` — rsync doit cibler src/, pas dist/**
25. **PATCH profile auto-save non-bloquant** — erreur catchée silencieusement
26. **BLV VD = API REST AkomaNtoso** (pas HTML statique direct) — session 18
27. **Firefox Playwright sur Spark** disponible pour découvrir des APIs masquées par SPA

---

## Avertissements (héritage sessions 11-18)

1. **`.env` prod jamais rsync**
2. **`trust proxy 1`** ne pas retirer
3. **qa-lexa 15/15 baseline** — si un test fail, investiguer avant push
4. **HMAC Pro→Lexa** : ne jamais JSON.stringify deux fois
5. **JWT override req.tenantId** — header `X-Tenant-Id` ignoré sur routes protégées
6. **Disclaimer PDF/XML obligatoire**
7. **deepseek-ocr sur Spark** : ne jamais décharger avec keep_alive=0
8. **LEXA_ENABLED=true côté Pro** : ne jamais passer à false
9. **Backend = tsx watch src/** (pas dist compilé) — découvert session 17
10. **Templates YAML dans src/execution/templates/** — copier dans src lors du rsync
11. **BLV VD htmlId** : si le Canton VD met à jour la loi, appeler l'endpoint CONSOLIDE pour obtenir le nouveau htmlId

---

**Dernière mise à jour** : 2026-04-15 (fin session 19 — Wizard PP Vaud livré, qa-lexa 16/16)
