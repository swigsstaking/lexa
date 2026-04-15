# NEXT SESSION — Point de reprise

**Dernière session** : [Session 16 — 2026-04-15](2026-04-15-session-16.md)
**Prochaine session** : Session 17 — **Wizard contribuable PP Genève + webhook retour Pro + onboarding personnel**

> Session 16 a fermé la dette #28 Canton Genève : KB ingérée (373
> articles), agent `lexa-fiscal-pp-ge` actif, 5 agents au total. Session
> 17 doit répéter le pattern session 15 pour GE : un contribuable
> genevois doit pouvoir générer sa déclaration PP via le wizard web
> sur `lexa.swigs.online/taxpayer/2026`.

---

## Ce qui marche après session 16

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | ✅ |
| Auth JWT + rate limit + trust proxy 1 | ✅ |
| HMAC Pro→Lexa + classify auto | ✅ synthétique validé session 16 |
| EmbedderClient probe réelle | ✅ |
| **Wizard contribuable** | |
| Wizard PP VS 6 steps sur `/taxpayer/:year` | ✅ session 15 |
| Dual mode `draft | ledger | mixed` dans `VsPpFormBuilder` | ✅ |
| TaxpayerFieldUpdated audit events | ✅ |
| Wizard PP GE | ❌ **cible session 17** |
| **Knowledge base** | |
| Canton VS (339 articles LF + Guide PP + déductions) | ✅ |
| **Canton GE (373 articles LCP/LIPP/LIPM)** | ✅ **session 16** |
| Qdrant `swiss_law` | 5761 pts |
| **Agents actifs** (5/7) | classifier, reasoning, tva, fiscal-pp-vs, **fiscal-pp-ge** |
| **Tests auto** | |
| qa-lexa 13/13 via HTTPS public | ✅ (5 classify + 3 tva + 2 fiscal-pp-vs + **1 fiscal-pp-ge** + 2 taxpayer) |

---

## Priorité session 17 — ordre strict

### A. Wizard contribuable PP Genève (~3h) — PRIORITÉ ABSOLUE

Le backend a déjà tout : agent `lexa-fiscal-pp-ge`, KB ingérée
(LCP/LIPP/LIPM), re-ranking cantonal, HMAC/auth stables. Il ne manque
qu'une **couche de personnalisation frontale + builder fiscal GE**.

**Décision design préalable** : **factoriser** VsPpFormBuilder et
GePpFormBuilder via un ancêtre commun, OU dupliquer ? Reco : **dupliquer
en v1** (GePpFormBuilder indépendant), factoriser en session 18 si
besoin. La duplication rend chaque builder lisible isolément et évite
un abstract layer prématuré. Le wizard frontend peut déjà être
factorisé car ses 6 steps sont structurellement identiques.

1. **Migration `006_personal_profile`** (~20 min)
   - Table `personal_profile` keyée sur `tenant_id` UNIQUE
   - Colonnes : `first_name`, `last_name`, `date_of_birth`, `civil_status`,
     `children_count`, `canton`, `commune`, `updated_at`
   - Pré-remplit le wizard step1 au fil des années fiscales (évite de
     re-saisir les mêmes infos stables en 2026, 2027, etc.)
   - Service `taxpayers/personal.ts` avec `getProfile(tenantId)` et
     `upsertProfile(tenantId, data)`
   - Auto-merge dans `getOrCreateDraft` : si un profil existe, inject
     dans `state.step1` à la création du draft

2. **Extension schéma `TaxpayerDraftStateSchema`** (~20 min)
   - `Step1Identity` ajoute `canton: z.enum(["VS", "GE"]).default("VS")`
     (déjà là en VS literal, à élargir)
   - `Step3Wealth` : nouveau champ `impotImmobilierComplementaire` (GE
     spécifique, LCP art. 76)
   - `Step4Deductions` : nouveau champ `coefficientCommunal` pour GE
     (selon commune)
   - Garder VS-PP compatible rétroactivement — les nouveaux champs sont
     tous optionnels

3. **Créer `01-knowledge-base/forms/ge-declaration-pp-2026.yaml`** (~15 min)
   - Même structure que `vs-declaration-pp-2024.yaml` mais avec les
     références cantonales GE : LIPP art. 17 (revenu), LIPP art. 46ss
     (fortune), LIPP art. 29 (frais pro), LCP art. 76 (immobilier), etc.
   - Barème GE progressif ~17% tranche max (vs ~14% VS)
   - Coefficient communal par défaut Genève-ville = 45.5 centimes 2024

4. **Créer `apps/backend/src/execution/GePpFormBuilder.ts`** (~30 min)
   - Clone de `VsPpFormBuilder` session 15 avec dual mode
     `draft | ledger | mixed`
   - Projection fiscale adaptée : même champs `revenuSalaire`,
     `revenuIndependant`, etc. mais calcul de `deductionFraisPro` qui
     respecte le barème GE (pas le forfait 3% VS)
   - `source: "draft"` en mode wizard, `source: "ledger"` en fallback

5. **Créer `apps/backend/src/execution/GePpPdfRenderer.ts`** (~30 min)
   - Clone de `VsPpPdfRenderer.ts` avec header "Canton de Genève" au
     lieu de "Canton du Valais"
   - Sections identiques (Contribuable, Revenus, Fortune, Déductions,
     Revenu imposable)
   - Nouvelle ligne "Impôt immobilier complémentaire" si
     `step3.impotImmobilierComplementaire > 0`
   - Disclaimer adapté : "AFC-GE" au lieu de "SCC VS"

6. **Nouveau endpoint `POST /taxpayers/draft/submit-ge`** (~20 min)
   - OU mieux : **routage dynamique** dans le endpoint existant
     `/taxpayers/draft/submit` basé sur `company.canton` :
     ```typescript
     if (canton === "GE") {
       const form = await buildGePpDeclaration({...});
       const pdf = await renderGePpPdf(form);
     } else {
       const form = await buildVsPpDeclaration({...});
       const pdf = await renderVsPpPdf(form);
     }
     ```
   - Event `DeclarationGenerated` typé avec `formKind: "GE-PP"` au lieu
     de `"VS-PP"` (extensible pattern session 12)

7. **Frontend wizard** (~45 min)
   - Lire `company.canton` depuis le store à l'entrée du wizard
   - Switch conditionnel dans `Step1Identity.tsx` :
     - Si canton = VS → dropdown 25 communes VS (existant)
     - Si canton = GE → dropdown 25 communes GE (nouveau)
   - Créer `data/communes-ge.ts` avec les 25 communes genevoises :
     Genève, Carouge, Lancy, Vernier, Meyrin, Onex, Thônex, Versoix,
     Plan-les-Ouates, Bernex, Chêne-Bougeries, Collonge-Bellerive,
     Grand-Saconnex, Satigny, Troinex, Cologny, Choulex, Puplinge,
     Anières, Pregny-Chambésy, Jussy, Veyrier, Chêne-Bourg, Vandœuvres,
     Dardagny
   - Ajuster `Step4Deductions.tsx` : afficher le coefficient communal GE
     si canton = GE (info-box), rappel que LIFD art. 33 al. 1 let. e
     s'applique au plafond pilier 3a
   - `Step6Generate.tsx` : le bouton download nomme le fichier
     `lexa-declaration-pp-ge-${year}-${lastName}.pdf` si canton = GE

8. **Smoke E2E via HTTPS public** (~15 min)
   - Inscrire un testeur `ge-test@lexa.test` avec
     `company.canton: "GE"`
   - Wizard pre-rempli step1 (après profile session 17 priorité 1), puis
     remplir les 4 steps avec un profil salarié genevois réaliste (Jean
     Dupont, Lancy, salaire 120k, pilier 3a 7056, primes 6500)
   - Générer le PDF et vérifier qu'il contient "Genève" et pas
     "Valais"

### B. Webhook retour Lexa → Pro (~1h) — reportable session 18 si A déborde

Reporté des sessions 14→15→16. Une fois qu'une transaction Pro est
ingérée et classifiée par Lexa, Lexa doit notifier Pro pour update
`BankTransaction.lexaClassification` côté Mongo.

1. **Côté Lexa** : nouveau hook post-classification dans
   `routes/connectors.ts` qui POST sur
   `${PRO_WEBHOOK_URL}/api/bank/lexa-classification` avec HMAC
   `X-Pro-Signature`
2. **Côté Pro** : nouveau endpoint `POST /api/bank/lexa-classification`
   avec middleware `requireHmac` (miroir du Lexa côté Pro)
3. **Nouveau secret** `PRO_WEBHOOK_SECRET` partagé (openssl rand -hex 32)
4. **Test** : POST manuel sur `/connectors/bank/ingest` avec
   `classify:true` → vérifier Pro reçoit le callback et update Mongo

### C. qa-lexa 14/14 + observation cron naturelle + journal (~30 min)

1. Ajouter 1 fixture GE-PP wizard (similaire à la fixture VS-PP session 15)
2. Re-run qa-lexa 14/14 via HTTPS public
3. **Observation cron naturelle** : lancer `nohup pm2 logs` en nohup
   dès le début de session et **ne pas restart pm2 pendant la fenêtre**.
   Si pas possible (besoin de deploy bloc A), accepter le synthétique
4. Journal session 17 + NEXT-SESSION session 18 + INDEX

---

## Règle de coupe

**Noyau obligatoire** : A + C. B reportable session 18 si A déborde
(c'est un nice-to-have async, le pont Pro→Lexa marche déjà unidirectionnel).

**À absolument éviter** : commencer B avant A. Le wizard GE-PP est la
valeur visible, le webhook Lexa→Pro est invisible pour le testeur
externe.

---

## Dettes reportées (ne pas traiter session 17 sauf gros creux)

- Fiscal PM Sàrl/SA — session 18
- Annexes CO bilans fiscaux — session 19
- Swissdec salaires — session 20+
- Projections bilan + compte résultat — session 19
- Mode fiduciaire multi-clients — session 20+
- Refresh tokens + email verification + password reset user-facing — session 21+
- Monitoring Prometheus / Grafana — session 22+
- Code-splitting frontend (743 KB → < 500 KB) — session 18+
- Bug mapping eCH-0097 côté swigs-workflow — 15 min dédiés
- Tests unitaires backend — session 23+
- 5 cantons SR restants (VD, FR, NE, JU, BE-Jura) — sessions 19-24
- Validation XML eCH-0217 xsd — session 19+
- Règlements d'application GE (complément LCP/LIPP/LIPM) — session 19+
- Guide PP Genève explicite (pour améliorer scores RAG pilier 3a GE) — session 18+

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→16)

1. **Canvas lib** → react-flow définitif
2. **Dark mode** → livré session 11
3. **Multi-tenant isolation par JWT** → req.tenantId override
4. **Autonomie IA** → validation humaine obligatoire
5. **Langue v1** → FR uniquement
6. **Auth** → JWT simple HS256 7d, bcryptjs cost 12
7. **Deploy** → `lexa.swigs.online` Let's Encrypt
8. **Webhook Pro↔Lexa** → HMAC SHA256 timing-safe (entrant session 14, sortant session 17+)
9. **PDF** → pdfkit backend
10. **Canvas minimap** → supprimée
11. **Template forms** → YAML canonique + copie runtime embed
12. **Fallback company orphelin** → CompanyInfo minimale
13. **Audit trail** → `DeclarationGenerated` + `TaxpayerFieldUpdated`
14. **Disclaimer PDF/XML non retirable**
15. **Helpers execution mutualisés** → `shared.ts`
16. **Idempotence par formKind**
17. **Un YAML + un Builder par formulaire**
18. **Un Modelfile par canton** → `lexa-fiscal-pp-vs`, **`lexa-fiscal-pp-ge`** (session 16)
19. **qa-lexa baseline de régression** → 13/13 après session 16
20. **HMAC service-to-service strictement séparé du JWT**
21. **Raw body via `express.json verify` hook**
22. **Deploy vhost HTTP → webroot → HTTPS** en 2 étapes
23. **Un draft par tenant par année fiscale**
24. **State wizard en JSONB flexible**
25. **Mutation atomique par dot-path**
26. **Side-panel preview client-side**
27. **`app.set('trust proxy', 1)` obligatoire** (session 15 fix critique)
28. **Source canonique KB cantonale** : préférer les sites officiels en HTML statique (SILGeneve, lex.vs.ch) aux SPA Angular (lexfind.ch). Découvert session 16
29. **Re-ranking agent cantonal** : tier 0 sources cantonales PP, tier 1 cantonales PM, tier 2 fédéral, tier 3 circulaires, tier 10 reste
30. **Observation cron = filet optionnel, pas bloquant** (session 16). Synthetic HMAC test suffit comme preuve fonctionnelle tant que le code n'a pas changé

---

## Infrastructure — vérification début session 17

```bash
# 1. Drifts .env + secrets + trust proxy (5 points)
ssh swigs@192.168.110.59 '
  grep -cE "DATABASE_URL|EMBEDDER_URL|JWT_SECRET|ADMIN_SECRET|LEXA_WEBHOOK_SECRET" /home/swigs/lexa-backend/.env
  grep -c "trust proxy" /home/swigs/lexa-backend/src/app.ts
  grep -c LEXA_WEBHOOK_SECRET /home/swigs/swigs-workflow/.env
'
# Attendu : 5 / 1 / 1

# 2. Backend health via HTTPS public
curl -s https://lexa.swigs.online/api/health | python3 -m json.tool

# 3. Agents liste (5 attendus)
curl -s https://lexa.swigs.online/api/agents | python3 -c "import sys,json;d=json.load(sys.stdin);print([a['id'] for a in d['agents']])"
# → ['classifier', 'reasoning', 'tva', 'fiscal-pp-vs', 'fiscal-pp-ge']

# 4. Modèles Ollama sur Spark (5 attendus)
ssh swigs@192.168.110.103 'ollama list | grep lexa-'

# 5. Qdrant collection (5761 minimum)
ssh swigs@192.168.110.103 'curl -s http://localhost:6333/collections/swiss_law | python3 -c "import sys,json;d=json.load(sys.stdin);print(\"points:\",d[\"result\"][\"points_count\"])"'

# 6. qa-lexa 13/13 (baseline avant toucher au code)
cd apps/backend && BASE_URL=https://lexa.swigs.online/api npx tsx src/scripts/qa-lexa.ts

# 7. Wizard PP VS toujours accessible
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://lexa.swigs.online/taxpayer/2026
# → 200

# 8. Smoke agent GE (confirme que l'agent session 16 marche toujours)
TOKEN=<bearer depuis step auth register>
curl -s -X POST https://lexa.swigs.online/api/agents/fiscal-pp-ge/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Plafond pilier 3a salarié Genève","context":{"status":"salarie","commune":"Geneve"}}'
```

---

## Avertissements (héritage sessions 11-16)

1. **`.env` prod jamais rsync** — règle immuable
2. **`trust proxy 1`** ne doit pas être retiré
3. **qa-lexa 13/13 baseline** — si un test fail, investiguer avant push
4. **HMAC Pro→Lexa** : ne jamais JSON.stringify deux fois côté Pro
5. **JWT override req.tenantId** — header `X-Tenant-Id` ignoré sur routes protégées
6. **Disclaimer PDF/XML obligatoire**
7. **Observation cron `:30`** : lancer le tail via `nohup` sur `.59` (pas
   local), **ne pas restart pm2 pendant la fenêtre**
8. **Les valeurs seed `-6253 CHF`** ne doivent plus jamais apparaître dans
   un PDF VS-PP généré depuis un wizard correctement rempli
9. **Sources KB cantonales** : privilégier les HTML statiques officiels
   (lex.vs.ch, silgeneve.ch) aux SPA Angular. Plus stable, plus rapide,
   pas besoin de Playwright
10. **Le re-ranking agent cantonal** doit toujours mettre les sources du
    canton concerné en tier 0, pas en fallback — sinon le modèle cite
    des sources d'un autre canton

---

**Dernière mise à jour** : 2026-04-15 (fin session 16 — Canton Genève ingéré + agent fiscal-pp-ge)
