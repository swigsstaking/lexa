# NEXT SESSION — Point de reprise

**Dernière session** : [Session 15 — 2026-04-15](2026-04-15-session-15.md)
**Prochaine session** : Session 16 — **Canton Genève + agent contextuel wizard + webhook retour Pro + onboarding personnel**

> Session 15 a fait passer VS-PP de démo à produit : un salarié valaisan
> peut désormais générer sa déclaration en 6 étapes via
> `https://lexa.swigs.online/taxpayer/2026`. Session 16 doit élargir le
> périmètre géographique (Genève) et enrichir l'expérience du wizard
> existant (agent contextuel, profil personnel persistant, webhook retour Pro).

---

## Ce qui marche après session 15

| Composant | État |
|---|---|
| **Plateforme** | |
| `https://lexa.swigs.online` HTTPS + proxy /api | ✅ |
| Auth JWT + rate limit + **trust proxy fix** (session 15) | ✅ |
| HMAC Pro→Lexa | ✅ smoke manuel OK |
| `EmbedderClient.health()` probe réelle | ✅ |
| **Wizard contribuable PP VS** | |
| Migration `005_taxpayer_drafts` | ✅ appliquée prod |
| Routes `GET/PATCH/POST/RESET /taxpayers/draft` | ✅ JWT-protégées |
| `VsPpFormBuilder` dual mode `draft/ledger/mixed` | ✅ source affichée dans PDF footer |
| Wizard 6 steps + side-panel preview + debounce 500ms | ✅ compile + deploy |
| Route `/taxpayer/:year` + bouton accès depuis Workspace | ✅ |
| Smoke E2E Marie Dubois Sion | ✅ revenuImposable 79'894 CHF, PDF 3498 bytes |
| **Event store** | |
| Event type `TaxpayerFieldUpdated` | ✅ (audit trail best-effort) |
| **Tests auto** | |
| qa-lexa 12/12 via HTTPS public | ✅ (10 anciens + 2 taxpayer) |
| **Agents** | |
| 4 agents actifs (classifier, reasoning, tva, fiscal-pp-vs) | ✅ |

---

## Priorité session 16 — ordre strict

### A. Webhook retour Lexa → Pro (~1h) — PRIORITÉ 1

Le pont Pro → Lexa classifie les transactions bancaires mais Pro ne voit
rien en retour. Ajouter un hook post-classification qui notifie Pro pour
qu'il update `BankTransaction.lexaClassification` côté Mongo.

1. **Côté Lexa** : nouveau hook dans `routes/connectors.ts` qui, après
   un `TransactionClassified` event, POST sur
   `${PRO_WEBHOOK_URL}/api/bank/lexa-classification` avec :
   ```json
   {
     "txId": "...",
     "debitAccount": "6510",
     "creditAccount": "1020",
     "tvaRate": 8.1,
     "tvaCode": "TVA-8.1-standard",
     "confidence": 0.95,
     "citations": [...],
     "reasoning": "..."
   }
   ```
   + header `X-Pro-Signature: sha256=${HMAC-SHA256(PRO_WEBHOOK_SECRET, body)}`.
   Non-blocking avec `try/catch` + log.
2. **Côté Pro** : nouveau endpoint `POST /api/bank/lexa-classification`
   dans `swigs-workflow` avec middleware `requireHmac` (miroir de celui
   de Lexa), met à jour `BankTransaction.lexaClassification` Mongo field.
3. **Secret partagé** : `PRO_WEBHOOK_SECRET` dans `/home/swigs/lexa-backend/.env`
   et `/home/swigs/swigs-workflow/.env` (openssl rand -hex 32).
4. **Test** : POST manuel sur `/connectors/bank/ingest` avec `classify:true`
   → vérifier que Pro reçoit le callback et update Mongo. Peut être
   observé via `mongosh` direct.

### B. Agent contextuel dans le wizard (~45 min) — PRIORITÉ 2

Session 15 a laissé un placeholder pour un bouton chat contextuel dans
chaque step. Session 16 l'implémente :

1. **Bouton flottant** `"Demander à Lexa"` en bas à droite de chaque step
   du wizard. Icône `MessageSquare`.
2. **Au click** : ouvre le `ChatOverlay` existant (Cmd+K) avec un prompt
   **pré-rempli contextualisé** selon le step courant. Exemple pour
   Step 4 Déductions : *"Je suis {civilStatus} à {commune} avec un
   salaire brut de {salaireBrut} CHF. Quel est mon plafond pilier 3a
   exact pour 2024 ?"*
3. **Pipeline** : le template de prompt vit dans
   `src/data/wizard-prompts.ts`, une fonction par step qui prend le
   `draft.state` et retourne une string enrichie. L'agent appelé est
   `fiscal-pp-vs` (session 13).
4. **Pas de changement backend** — le bouton réutilise `lexa.fiscalPpAsk()`
   et affiche le résultat dans le `ChatOverlay` avec citations cliquables
   vers fedlex.

### C. Profil personnel persistant (~45 min) — PRIORITÉ 2

Actuellement les champs stables (nom, prénom, date de naissance, civilStatus,
commune) sont saisis à chaque nouvelle année fiscale. Session 16 :

1. **Migration `006_personal_profile`** : table keyée sur `tenant_id`
   UNIQUE avec les champs stables + `updated_at`.
2. **Service `taxpayers/personal.ts`** avec `getProfile(tenantId)` et
   `upsertProfile(tenantId, data)`.
3. **Auto-préremplissage** dans `getOrCreateDraft` : si le profil existe,
   merge dans `state.step1` au moment de la création du draft. Si le
   wizard update un champ stable, le profil est aussi updated (dual
   write, v1 acceptable pour un user per tenant).
4. **Pas de nouveau UI** — le changement est transparent pour le user,
   les champs step1 arrivent déjà pré-remplis.

### D. Canton Genève (~2h) — PRIORITÉ 3, reportable session 17

Bloc reporté de session 15. **Ne pas commencer si A+B+C dépassent 2h30.**

1. **Ingestion KB Genève** (~1h)
   - Télécharger LCP + LIPP + LIPM depuis `lex.ge.ch` (ou LexFind GE)
   - Script Python `ingest_vs_pdfs_lexa.py` adapté pour GE (même pipeline)
   - Tag `cantonal-GE` + loi spécifique
   - Vérification : `rag/ask "Plafond pilier 3a 2024 Genève"` doit retourner
     des citations `LCP` ou `LIPP`
2. **Modelfile `lexa-fiscal-pp-ge`** sur Spark (~15 min, pattern session 13)
3. **Agent `FiscalPpGeAgent`** + endpoint `POST /agents/fiscal-pp-ge/ask` (~30 min)
4. **Routage contextuel** dans le frontend : selon `company.canton`,
   le bouton `fiscal-pp` du wizard appelle VS ou GE agent (~15 min)
5. **Pas de wizard GE-PP en session 16** — le formulaire GE dédié vient
   session 17 avec son propre builder + template YAML

### E. qa-lexa re-run + observation cron `:30` + journal + commits + push (~30 min)

1. **qa-lexa 13/13** : ajouter 1 fixture pour le webhook retour Lexa→Pro
   (si bloc A fait) ou garder 12/12 sinon
2. **Observation cron `:30`** : à relancer dès le début de session, kill
   et grep à la fin. Session 15 a 2 captures (une avant fix trust proxy,
   une après) — cumulées ~30 min de logs avec 0 POST capturé. Session 16
   doit avoir une fenêtre plus longue (~1h30) pour garantir au moins un
   tick naturel
3. **Journal session 16** + update NEXT-SESSION session 17 + INDEX
4. Commits incrémentaux (migration+routes, wizard agent contextuel, webhook retour, GE si fait)
5. Push `origin/main`

---

## Règle de coupe

**Noyau obligatoire** : A + B + C + E (webhook retour + agent contextuel +
profil personnel + journal).

**Reportable session 17** : D (canton Genève) si A+B+C dépassent 2h30.

Justification : webhook retour est la dernière pièce du pont Pro↔Lexa,
agent contextuel complète le wizard session 15, profil personnel évite
une frustration UX majeure pour les testeurs externes. Canton Genève
ajouterait de la surface sans profondeur si le wizard VS reste incomplet.

---

## Dettes reportées (NE PAS traiter session 16 sauf gros creux)

- Fiscal PM Sàrl/SA — session 17+
- Annexes CO bilans fiscaux — session 17+
- Swissdec salaires — session 18+
- Projections bilan + compte résultat — session 17
- Mode fiduciaire multi-clients — session 18+
- Email verification + password reset user-facing — session 18+
- Refresh tokens — session 18+
- Monitoring Prometheus / Grafana — session 19+
- Code-splitting frontend (743 KB → < 500 KB) — session 17+
- Bug mapping eCH-0097 côté swigs-workflow — 15 min dédiés
- Tests unitaires backend — session 20+
- GE-PP wizard dédié — session 17 (après l'agent GE session 16)
- Validation XML eCH-0217 contre xsd officiel — session 17+

---

## Décisions tranchées — ne plus réinterpréter

(reprise sessions 11→15)

1. **Canvas lib** → react-flow définitif
2. **Dark mode** → livré session 11
3. **Multi-tenant isolation par JWT** → session 14 override req.tenantId
4. **Autonomie IA** → validation humaine v1
5. **Langue v1** → FR uniquement
6. **Auth** → JWT simple HS256 7d, bcryptjs cost 12, pas de refresh v1
7. **Deploy** → `lexa.swigs.online` live
8. **Webhook Pro→Lexa** → HMAC SHA256 `X-Lexa-Signature` timing-safe
9. **Webhook Lexa→Pro** (session 16) → HMAC SHA256 `X-Pro-Signature`
   avec `PRO_WEBHOOK_SECRET` séparé du `LEXA_WEBHOOK_SECRET`
10. **PDF** → pdfkit backend
11. **Canvas minimap** → supprimée
12. **Template forms** → YAML canonique + copie runtime embed
13. **Fallback company orphelin** → CompanyInfo minimale
14. **Audit trail** → `DeclarationGenerated` + `TaxpayerFieldUpdated`
15. **Disclaimer PDF non retirable**
16. **Helpers execution mutualisés** → `shared.ts`
17. **Idempotence par formKind**
18. **Un YAML + un Builder par formulaire**
19. **Un Modelfile par canton**
20. **qa-lexa baseline de régression**
21. **HMAC service-to-service strictement séparé du JWT**
22. **Raw body via `express.json verify` hook**
23. **Deploy vhost HTTP → webroot → HTTPS** en 2 étapes
24. **Un draft par tenant par année fiscale** (session 15)
25. **State wizard en JSONB flexible** (session 15)
26. **Mutation atomique par dot-path** (session 15)
27. **Side-panel preview client-side** (session 15)
28. **`app.set('trust proxy', 1)` pour le rate limiter derrière nginx** (session 15 fix critique)

---

## Infrastructure — vérification début session 16

```bash
# 1. Drifts .env + 3 secrets auth (5 lignes côté Lexa, 1 côté Pro)
ssh swigs@192.168.110.59 'grep -cE "DATABASE_URL|EMBEDDER_URL|JWT_SECRET|ADMIN_SECRET|LEXA_WEBHOOK_SECRET" /home/swigs/lexa-backend/.env'
# → 5

# 2. Backend health via public HTTPS
curl -s https://lexa.swigs.online/api/health | python3 -m json.tool
# → ok:true, 5388 pts, embedder probe réelle true

# 3. Wizard accessible
curl -s https://lexa.swigs.online/ | grep -c "Lexa · Comptabilité"
# → 1

# 4. qa-lexa 12/12 (noir sur blanc avant de toucher au code)
cd apps/backend && BASE_URL=https://lexa.swigs.online/api npx tsx src/scripts/qa-lexa.ts

# 5. Flow taxpayer via HTTPS (register → draft → submit)
TS=$(date +%s)
REG=$(curl -sX POST https://lexa.swigs.online/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"s16-probe-${TS}@lexa.test\",\"password\":\"ProbePass2026!\",\"company\":{\"name\":\"Probe\",\"legalForm\":\"sarl\",\"canton\":\"VS\"}}")
TOKEN=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s "https://lexa.swigs.online/api/taxpayers/draft?year=2026" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 6. Logs observation cron :30 (lancer en background dès le début)
ssh swigs@192.168.110.59 "pm2 logs lexa-backend --lines 0 --raw --timestamp" > /tmp/lexa-cron-s16.log &
# ... attendre un :30 sans redémarrage pm2 ...
kill %1
grep -cE "connectors/bank|TransactionClassified" /tmp/lexa-cron-s16.log
```

---

## Avertissements (héritage sessions 11-15)

1. **`.env` prod jamais rsync.** Règle immuable — `--exclude=.env` toujours
2. **`trust proxy 1`** ne doit pas être retiré — sans lui, le rate limiter
   casse silencieusement en prod derrière nginx (session 15)
3. **qa-lexa baseline 12/12** — si un test fail, investiguer avant push
4. **HMAC des deux côtés** : ne jamais JSON.stringify deux fois côté Pro
5. **JWT override req.tenantId** — header `X-Tenant-Id` ignoré sur routes protégées
6. **Disclaimer PDF/XML obligatoire** (whitepaper §6)
7. **Observation cron `:30`** : lancer le tail dès le début de session et
   ne **pas** restart lexa-backend pendant le tick attendu
8. **Les valeurs seed `-6253 CHF`** ne doivent plus jamais apparaître dans
   un PDF VS-PP généré depuis un wizard correctement rempli. Si c'est le
   cas, le dual mode draft/ledger est cassé

---

**Dernière mise à jour** : 2026-04-15 (fin session 15 — wizard contribuable PP VS livré, VS-PP devient produit)
