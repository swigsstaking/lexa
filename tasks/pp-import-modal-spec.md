# Modal Import Universel PP — Spec d'implémentation

**Version :** 1.0
**Date :** 2026-04-21
**Cible :** V1.3 Lexa
**Auteurs :** instance mère Claude Opus 4.7

---

## 1. Objectif

Réduire drastiquement la friction de saisie dans les wizards fiscaux PP (7 cantons) en permettant l'import automatique de documents fiscaux/financiers (OCR + parsing structuré) et de données crypto (snapshots blockchain au 31.12).

**Périmètre V1.3** :
- Modal universel d'import accessible depuis `PpWorkspace`
- 6 catégories d'import (cf. §3) avec drag&drop universel + sélection par catégorie
- Pipeline OCR via `qwen3-vl-ocr` Ollama (DGX) — modèle à confirmer par P1.A.1
- Parser Swissdec ELM (XML + QR-code) pour certificats de salaire
- Module crypto : wallets ETH/BTC/SOL + snapshots annuels via CoinMarketCap (prix CHF) + Etherscan/Blockstream/Solana RPC (soldes)
- Flow validation humaine (modal diff) avant commit dans le wizard
- Nouvelle swimlane "Crypto" dans `PpWorkspace`

**Hors scope V1.3** :
- Multi-chains au-delà de ETH/BTC/SOL (Polygon, BSC, etc.)
- Import depuis APIs bancaires (Open Banking suisse / FinPort) — V1.4
- OCR multilingue (DE/IT) — V1.4

---

## 2. Architecture haute-niveau

```
┌──────────────────┐
│  PpWorkspace.tsx │  ← bouton "Importer"
└────────┬─────────┘
         │ ouvre
         ▼
┌──────────────────────────────┐         ┌─────────────────────┐
│  PpImportModal.tsx           │ ──POST→ │ /api/pp/import/...  │
│  • drag&drop universel       │         │ (apps/backend/      │
│  • 6 cards catégories        │         │  src/routes/pp.ts)  │
│  • flux crypto dédié         │         └──────────┬──────────┘
└──────────────────────────────┘                    │
         ▲                                          │ enqueue
         │ poll status                              ▼
         │                                ┌──────────────────────┐
         │                                │  BullMQ jobs:        │
         │                                │  • ocr.process       │
         │                                │  • crypto.snapshot   │
         │                                │  • swissdec.parse    │
         │                                └──────────┬───────────┘
         │                                           │
         │                                           ▼
┌──────────────────────────────┐         ┌──────────────────────┐
│  PpImportValidationModal.tsx │ ◄─poll─ │  Postgres event-store│
│  (diff IA→user, commit final)│         │  pp_imports / crypto*│
└──────────────────────────────┘         └──────────────────────┘
```

---

## 3. UX Modal Import Universel

### 3.1 Vue principale

```
┌─────────────────────────────────────────────────────┐
│  Importer / Saisir vos données fiscales        [×] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │  📥 Glissez-déposez un document ici           │ │
│  │     ou cliquez pour sélectionner              │ │
│  │     (PDF, JPG, PNG, max 10 MB)                │ │
│  │     Détection automatique du type             │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ───── ou choisissez une catégorie ─────           │
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │💼 Salaire│ │🏦 Fortune│ │📈 Place- │ │🧾 Frais │  │
│  │ Swissdec │ │ Banques  │ │ ments    │ │ déduct. │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│  ┌─────────┐ ┌─────────┐                           │
│  │🛡️ Assur. │ │₿ Crypto  │                          │
│  │ 3a/mal.  │ │ wallet   │                          │
│  └─────────┘ └─────────┘                           │
│                                                     │
│  Mes imports en cours (3) ▾                        │
│  • Certif salaire — extracted, validation ready    │
│  • Wallet ETH 0xa1b2... — snapshot 31.12 OK        │
│  • Frais transport — extracted, low confidence ⚠   │
└─────────────────────────────────────────────────────┘
```

### 3.2 Catégories et leurs flux

| Catégorie | Flux | Wizard step ciblé |
|---|---|---|
| 💼 Salaire | Upload PDF/image OU entrée manuelle | Step2Revenues |
| 🏦 Fortune (relevés bancaires) | Upload PDF | Step3Wealth |
| 📈 Placements (titres, fonds) | Upload PDF | Step3Wealth |
| 🧾 Frais déductibles (factures, notes) | Upload images multiples | Step4Deductions |
| 🛡️ Assurances (3a, maladie, vie) | Upload PDF/image | Step4Deductions |
| ₿ Crypto | Formulaire wallet (chain + address) | nouvelle swimlane Crypto |

### 3.3 Drag & drop universel

Quand un fichier est déposé sans catégorie :
1. Frontend → `POST /api/pp/import/upload` avec `category: "auto"`
2. Backend appelle classifier vision (`qwen3-vl-ocr`) avec prompt :
   ```
   Quel type de document fiscal suisse est-ce ? Réponds en JSON:
   {"type": "salary_certificate" | "bank_statement" | "investment" | "expense" | "insurance" | "unknown", "confidence": 0.0-1.0}
   ```
3. Si `confidence ≥ 0.7` → routage vers le bon parser
4. Sinon → demande à l'user de choisir manuellement

### 3.4 Modal validation diff (PpImportValidationModal)

Quand status = `extracted` :
```
┌─────────────────────────────────────────────────┐
│  Vérifier l'import — Certificat de salaire 2026 │
├─────────────────────────────────────────────────┤
│  Champ                  Extrait    À utiliser   │
│  Employeur              ACME SA    [ACME SA   ] │
│  Salaire brut annuel    102'000    [102000    ] │
│  AVS/AI/APG             7'140      [7140      ] │
│  LPP part employé       6'120      [6120      ] │
│  Frais professionnels   3'000      [3000      ] │
│  Indemnités diverses    1'500      [1500      ] │
│                                                  │
│  Confiance OCR : 94%                             │
│  ⚠ 2 champs faible confiance (frais, indemnités)│
│                                                  │
│  [Annuler]              [Valider et importer]   │
└─────────────────────────────────────────────────┘
```

Validation → `POST /api/pp/import/:id/validate` avec valeurs corrigées → commit dans le wizard.

---

## 4. Data model (Postgres event-store)

### 4.1 Migration SQL

Fichier : `apps/backend/src/db/migrations/2026XX_pp_imports.sql`

```sql
-- pp_imports : événements d'import (un par doc/wallet)
CREATE TABLE pp_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'salary', 'wealth', 'investment', 'expense', 'insurance', 'crypto', 'auto'
  )),
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'crypto_wallet', 'manual')),
  source_url TEXT,                  -- chemin local /uploads/<tenant>/<id>.pdf
  source_meta JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'extracted', 'validated', 'committed', 'failed'
  )),
  raw_extraction JSONB,             -- output brut du modèle OCR/parser
  validated_data JSONB,             -- données après validation humaine
  confidence NUMERIC(3,2),          -- 0.00-1.00
  wizard_step_target TEXT,          -- 'Step2Revenues' | 'Step3Wealth' | ...
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_imports_tenant_status ON pp_imports(tenant_id, status);
CREATE INDEX idx_pp_imports_user ON pp_imports(user_id);

-- RLS obligatoire (règle absolue)
ALTER TABLE pp_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY pp_imports_tenant_isolation ON pp_imports
  USING (tenant_id = current_setting('app.tenant_id')::uuid);


-- pp_crypto_wallets : adresses wallet enregistrées
CREATE TABLE pp_crypto_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('eth', 'btc', 'sol')),
  address TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chain, address)
);

ALTER TABLE pp_crypto_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_crypto_wallets FORCE ROW LEVEL SECURITY;
CREATE POLICY pp_crypto_wallets_tenant_isolation ON pp_crypto_wallets
  USING (tenant_id = current_setting('app.tenant_id')::uuid);


-- pp_crypto_snapshots : snapshot annuel des wallets
CREATE TABLE pp_crypto_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES pp_crypto_wallets(id) ON DELETE CASCADE,
  year INT NOT NULL,
  balance_native NUMERIC(38, 18) NOT NULL,
  balance_chf NUMERIC(20, 2) NOT NULL,
  price_chf_at_31_12 NUMERIC(20, 8) NOT NULL,
  price_source TEXT NOT NULL DEFAULT 'coinmarketcap',
  balance_source TEXT NOT NULL,     -- 'etherscan' | 'blockstream' | 'solana_rpc'
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, year)
);

ALTER TABLE pp_crypto_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_crypto_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY pp_crypto_snapshots_tenant_isolation ON pp_crypto_snapshots
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 4.2 Règle d'or
**Toutes les requêtes sur ces tables passent par `queryAsTenant()`** (pas `query()`). Sinon RLS bloque.

---

## 5. API contracts

Toutes les routes ajoutées dans `apps/backend/src/routes/pp.ts` (le fichier existe déjà — étendre, ne pas créer un nouveau fichier).

### 5.1 Upload document

```
POST /api/pp/import/upload
Content-Type: multipart/form-data
Headers: Authorization: Bearer <jwt>

Body:
  file: <binary>
  category: 'auto' | 'salary' | 'wealth' | 'investment' | 'expense' | 'insurance'
  meta?: JSON string

Response 202:
{
  "id": "uuid",
  "status": "pending",
  "category": "auto",
  "estimated_seconds": 15
}

Limites :
- max file size : 10 MB
- types acceptés : application/pdf, image/jpeg, image/png
- rate limit : 10 uploads/min/user
```

### 5.2 Get import status

```
GET /api/pp/import/:id

Response 200:
{
  "id": "uuid",
  "status": "extracted",
  "category": "salary",
  "confidence": 0.94,
  "raw_extraction": { ... },
  "validated_data": null,
  "error_message": null,
  "wizard_step_target": "Step2Revenues",
  "created_at": "...",
  "updated_at": "..."
}
```

### 5.3 List imports (pour panneau "Mes imports en cours")

```
GET /api/pp/import?status=pending,processing,extracted&limit=20

Response 200:
{
  "items": [...],
  "total": 3
}
```

### 5.4 Validate import (commit dans wizard)

```
POST /api/pp/import/:id/validate
Body:
{
  "validated_data": {
    "employer_name": "ACME SA",
    "gross_annual_salary": 102000,
    "ahv_ai_apg": 7140,
    ...
  }
}

Response 200:
{
  "id": "uuid",
  "status": "committed",
  "wizard_state_updated": true
}

Side-effect : update du store wizard PP (état serveur ou pré-fill côté client selon archi)
```

### 5.5 Crypto — wallets

```
POST /api/pp/crypto/wallet
Body: { "chain": "eth", "address": "0x...", "label": "Wallet principal" }
Response 201: { "id": "uuid", ... }

GET /api/pp/crypto/wallet
Response 200: { "wallets": [{ "id", "chain", "address", "label", "last_snapshot": {...} }] }

DELETE /api/pp/crypto/wallet/:id
Response 204
```

### 5.6 Crypto — snapshots

```
POST /api/pp/crypto/snapshot/refresh
Body: { "wallet_id": "uuid", "year": 2026 } (year optionnel, défaut = année courante - 1)
Response 202: { "job_id": "...", "estimated_seconds": 30 }

GET /api/pp/crypto/snapshot?year=2026
Response 200:
{
  "year": 2026,
  "snapshots": [{
    "wallet_id": "uuid",
    "chain": "eth",
    "address": "0x...",
    "balance_native": "1.234567890123456789",
    "balance_chf": 3450.12,
    "price_chf_at_31_12": 2795.50,
    "snapshotted_at": "2027-01-02T02:00:00Z"
  }],
  "total_chf": 12450.30
}
```

---

## 6. Pipeline OCR (BullMQ)

Réutiliser le système BullMQ existant Lexa (cf. `apps/backend/src/jobs/`).

### 6.1 Job `ocr.process`

```ts
// apps/backend/src/jobs/ocrProcess.ts
type OcrProcessJob = {
  importId: string;
  tenantId: string;
  filePath: string;     // chemin /uploads/<tenant>/<importId>.pdf
  category: 'auto' | 'salary' | 'wealth' | ...;
};

async function processOcr(job: OcrProcessJob) {
  // 1. Update status = 'processing'
  await queryAsTenant(tenantId, sql`
    UPDATE pp_imports SET status='processing', updated_at=now() WHERE id=${importId}
  `);

  // 2. Si category = 'auto' → classifier vision
  let category = job.category;
  if (category === 'auto') {
    category = await classifyDocumentType(filePath);  // appel qwen3-vl-ocr
  }

  // 3. Si category === 'salary' → tenter d'abord parser Swissdec ELM
  let extraction;
  let confidence;
  if (category === 'salary') {
    const swissdec = await trySwissdecELM(filePath);  // QR-code + XML
    if (swissdec) {
      extraction = swissdec;
      confidence = 1.0;  // QR-code = 100% précision
    } else {
      // Fallback OCR
      [extraction, confidence] = await ocrSalaryDocument(filePath);
    }
  } else {
    [extraction, confidence] = await ocrByCategory(filePath, category);
  }

  // 4. Update status = 'extracted'
  await queryAsTenant(tenantId, sql`
    UPDATE pp_imports
    SET status='extracted', raw_extraction=${extraction}, confidence=${confidence},
        category=${category}, wizard_step_target=${categoryToStep(category)}, updated_at=now()
    WHERE id=${importId}
  `);
}
```

### 6.2 Modèle OCR

Endpoint Ollama : `http://192.168.110.103:11434/api/generate`
Modèle : `qwen3-vl-ocr:latest` (à confirmer après P1.A.1)

Prompt template par catégorie : voir `apps/backend/src/services/ocr/prompts.ts` (à créer).

Exemple prompt salaire :
```
Tu es un assistant OCR spécialisé dans les certificats de salaire suisses (Swissdec ELM).
Extrais les champs suivants depuis l'image. Retourne UNIQUEMENT du JSON valide.

{
  "employer_name": string,
  "employer_uid": string | null,
  "employee_name": string,
  "year": number,
  "gross_annual_salary": number,        // CHF
  "thirteenth_salary": number | null,
  "bonus": number | null,
  "ahv_ai_apg": number,                 // déductions
  "lpp_employee": number,
  "alv_employee": number | null,
  "professional_expenses": number | null,
  "other_income": number | null
}

Si un champ est absent ou illisible, mets null. Confiance globale entre 0.0 et 1.0.
```

### 6.3 Stockage fichiers

- V1.3 : stockage local sur `.59` dans `/var/lexa/uploads/<tenant_id>/<import_id>.<ext>`
- Permissions : 0640 owner=swigs group=lexa
- Cron purge : > 90 jours et status `committed` → archive cold storage (V1.4)

---

## 7. Module crypto

### 7.1 Clients API

```
apps/backend/src/services/crypto/
├── coinmarketcap.ts          # prix CHF historiques
├── etherscan.ts              # solde ETH (clé free tier à créer)
├── blockstream.ts            # solde BTC (sans clé)
├── solana.ts                 # solde SOL (RPC public)
└── snapshotService.ts        # orchestration
```

### 7.2 Variables d'env

```
# .env (NE PAS rsync vers prod — règle absolue)
CMC_API_KEY=<clé fournie par user>          # https://pro-api.coinmarketcap.com
ETHERSCAN_API_KEY=<clé free à créer>        # https://etherscan.io/apis
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com  # ou Helius si quota dépassé
```

⚠️ La clé CMC fournie en chat doit être ajoutée à `.env.production` sur `.59` uniquement (jamais en clair dans git ou .env.example).

### 7.3 Cron snapshot annuel

Réutiliser le système cron Lexa existant (cf. `apps/backend/src/scheduler/` ou similaire).

```
# Cron : 2 janvier 02:00 (snapshot année N-1)
0 2 2 1 * → snapshotAllWalletsForYear(currentYear - 1)
```

Logique :
1. **1 seul appel CoinMarketCap** : `/v2/cryptocurrency/quotes/historical?symbol=ETH,BTC,SOL&time=2026-12-31&convert=CHF` → 3 prix en 1 requête
2. **N appels balances** (1 par wallet, batch en parallèle 5 max) :
   - ETH : `etherscan.io/api?module=account&action=balance&address=...&tag=block_at_unix_2026-12-31T23:59:59Z`
   - BTC : `blockstream.info/api/address/.../utxo` puis somme à la date cible (Blockstream supporte block height)
   - SOL : Solana RPC `getBalance` (snapshot temporel via `getBlocksWithLimit` pour trouver le bon slot)
3. Persistence en `pp_crypto_snapshots` (UPSERT sur `(wallet_id, year)`)
4. En cas d'erreur API : retry x3 avec backoff exponentiel (10s, 60s, 300s) puis log + status `failed`

### 7.4 Refresh manuel

Bouton dans la swimlane Crypto → `POST /api/pp/crypto/snapshot/refresh` → enqueue job `crypto.snapshot.single`.

---

## 8. Module Swissdec ELM (parser certificat de salaire)

### 8.1 Specs publiques à intégrer

Swissdec ELM 5.0 — spec publique : https://www.swissdec.ch/fr/releases-und-updates/
- QR-code 2D (encoding base64 d'un XML conforme XSD ELM 5.0)
- Format XML : `<Lohnausweis xmlns="http://www.swissdec.ch/schema/sd/20200220/Lohnausweis">...</Lohnausweis>`

⚠️ Si specs précises non disponibles publiquement → un agent dédié devra fouiller https://www.swissdec.ch/ et la doc XSD avant l'implémentation.

### 8.2 Pipeline

```ts
// apps/backend/src/services/swissdec/elmParser.ts
async function trySwissdecELM(filePath: string): Promise<SalaryExtraction | null> {
  // 1. Si PDF : extraction texte (pdf-parse)
  // 2. Détection QR-code : utiliser jsQR ou zbar
  // 3. Si QR trouvé : décodage base64 → XML
  // 4. Validation XSD ELM 5.0 (lib node : libxmljs2)
  // 5. Mapping XML → SalaryExtraction structure
  // 6. Retour avec confidence = 1.0
  // 7. Si pas de QR ou XML invalide : return null (fallback OCR)
}
```

### 8.3 Mapping vers wizard

| Champ XML ELM | Champ wizard PP (Step2Revenues) |
|---|---|
| `Lohnausweis.PayrollPeriod.YearlyIncome` | `gross_annual_salary` |
| `Lohnausweis.Deductions.AHV_IV_EO` | `ahv_ai_apg` |
| `Lohnausweis.Deductions.PensionFund` | `lpp_employee` |
| `Lohnausweis.Allowances.MealAllowance` | `meal_allowance` |
| ... | ... |

---

## 9. Frontend — composants

### 9.1 Nouveaux composants

```
apps/frontend/src/components/workspace/v2/
├── PpImportModal.tsx            # modal universel (drag&drop + 6 cards)
├── PpImportValidationModal.tsx  # modal diff IA→user
├── PpCryptoSwimlane.tsx         # nouvelle swimlane dans PpWorkspace
├── PpCryptoWalletForm.tsx       # formulaire ajout wallet
└── PpImportPanel.tsx            # panneau "Mes imports en cours"
```

### 9.2 Modifs sur composants existants

- `PpWorkspace.tsx` : ajouter bouton "Importer données" + intégrer `<PpImportModal>` + intégrer `<PpCryptoSwimlane>` après les 4 buckets existants
- `PpWorkspace.tsx` : remplacer `PP_DATA` mock par fetch `/api/pp/summary` + crypto data depuis `/api/pp/crypto/snapshot`

### 9.3 Hooks (TanStack Query)

```
apps/frontend/src/api/ppImport.ts
├── usePpImports()                  # GET /api/pp/import, refetch sur status changes
├── useUploadPpImport()              # POST upload
├── useValidatePpImport()            # POST validate
├── usePpCryptoWallets()             # GET wallets
├── useAddPpCryptoWallet()           # POST wallet
└── usePpCryptoSnapshot(year)        # GET snapshot
```

---

## 10. Plan d'implémentation — 4 agents en parallèle

Quand toutes les specs sont validées, lancer 4 agents Sonnet 4.6 en parallèle.

### Agent A — Frontend (modal + swimlane)
**Fichiers** :
- `apps/frontend/src/components/workspace/v2/PpImportModal.tsx`
- `apps/frontend/src/components/workspace/v2/PpImportValidationModal.tsx`
- `apps/frontend/src/components/workspace/v2/PpCryptoSwimlane.tsx`
- `apps/frontend/src/components/workspace/v2/PpCryptoWalletForm.tsx`
- `apps/frontend/src/components/workspace/v2/PpImportPanel.tsx`
- `apps/frontend/src/api/ppImport.ts` (hooks)
- Modifs `PpWorkspace.tsx`

**Critères d'acceptation** :
- Drag&drop fonctionnel sur PDF/JPG/PNG ≤10MB
- 6 cards catégories + flux crypto distinct
- Polling status import (refetch toutes les 3s tant que status ∈ {pending, processing})
- Modal diff avec édition champ par champ + confidence visuelle
- Swimlane crypto avec total CHF + bouton refresh
- Style cohérent avec `workspace-v2-theme.css`

### Agent B — Backend OCR + import
**Fichiers** :
- `apps/backend/src/db/migrations/2026XX_pp_imports.sql`
- Extension `apps/backend/src/routes/pp.ts` (nouvelles routes import)
- `apps/backend/src/services/ocr/index.ts` (client Ollama qwen3-vl-ocr)
- `apps/backend/src/services/ocr/prompts.ts` (prompts par catégorie)
- `apps/backend/src/jobs/ocrProcess.ts` (worker BullMQ)
- `apps/backend/src/services/storage/uploads.ts` (gestion fichiers)

**Critères d'acceptation** :
- Migration SQL appliquée + RLS testée
- Routes `POST /upload`, `GET /:id`, `GET /`, `POST /:id/validate` toutes via `queryAsTenant()`
- Worker BullMQ traite jobs en <30s p95 sur doc moyen
- Limite 10 MB + rate limit 10/min/user
- Tests unitaires sur prompts + parser OCR output JSON

### Agent C — Crypto (cron + clients API)
**Fichiers** :
- `apps/backend/src/services/crypto/coinmarketcap.ts`
- `apps/backend/src/services/crypto/etherscan.ts`
- `apps/backend/src/services/crypto/blockstream.ts`
- `apps/backend/src/services/crypto/solana.ts`
- `apps/backend/src/services/crypto/snapshotService.ts`
- `apps/backend/src/jobs/cryptoSnapshot.ts` (worker)
- `apps/backend/src/scheduler/cryptoSnapshotCron.ts` (cron 0 2 2 1 *)
- Routes crypto dans `apps/backend/src/routes/pp.ts`

**Critères d'acceptation** :
- 1 seul appel CMC pour N symbols (batch)
- Retry x3 + backoff exponentiel sur erreur API
- Cron déclenchable manuellement via CLI pour tests (`pnpm --filter backend run crypto:snapshot 2026`)
- UPSERT idempotent sur `(wallet_id, year)`
- Pas de clé API en clair dans le code (uniquement env vars)

### Agent D — Swissdec ELM parser
**Fichiers** :
- `apps/backend/src/services/swissdec/elmParser.ts`
- `apps/backend/src/services/swissdec/xsdValidator.ts`
- `apps/backend/src/services/swissdec/mapping.ts` (XML → wizard)
- Tests sur 5+ certificats Swissdec exemple (à fournir ou générer)

**Critères d'acceptation** :
- Détection QR-code dans PDF + image (jsQR ou zbar)
- Validation XSD ELM 5.0
- Mapping complet vers structure wizard PP
- Fallback gracieux vers OCR si QR absent ou invalide

---

## 11. Tests E2E (post-implémentation)

**Cas 1** : Upload certificat salaire Swissdec → QR-code détecté → confidence 1.0 → validation user → commit Step2Revenues
**Cas 2** : Upload certificat salaire NON-Swissdec → fallback OCR → confidence ~0.85 → user corrige 2 champs → commit
**Cas 3** : Drag&drop facture → classifier auto → catégorie "expense" → OCR → commit Step4Deductions
**Cas 4** : Ajout wallet ETH → refresh manuel → snapshot CHF correct vs CoinMarketCap → swimlane affiche le total
**Cas 5** : Cron annuel : ajouter 5 wallets, déclencher manuellement, vérifier 1 seul appel CMC + 5 calls balances

---

## 12. Risques et mitigations

| Risque | Mitigation |
|---|---|
| OCR confidence trop basse → mauvais pré-remplissage | Modal diff obligatoire + validation humaine |
| API blockchain rate-limit | Retry exponentiel + cache 24h sur snapshots non-31.12 |
| CMC quota dépassé (free tier 10k req/mois) | Cron annuel = 1 req/jour max; cache prix 31.12 = 1 req/an/symbol |
| Fichier malicieux uploadé | Validation MIME stricte + scan ClamAV (V1.4) |
| Swissdec specs non publiques en détail | Agent dédié recherche + fallback OCR si parser échoue |
| Lenteur OCR cold start | Pre-warm `qwen3-vl-ocr` au démarrage backend |

---

## 13. Dépendances et bloqueurs

- **P1.A.1 (mini-bench OCR)** : valider que `qwen3-vl-ocr` suffit, sinon télécharger un modèle plus gros AVANT impl
- **Specs Swissdec ELM** : obtenir XSD officielle (peut bloquer Agent D)
- **Clé Etherscan** : créer compte gratuit + générer API key (5 req/s)
- **CMC API key** : déjà fournie, à mettre en `.env.production` sur `.59`

---

## 14. Définition de "done"

- [ ] Toutes les routes API documentées et testées (unit + intégration)
- [ ] Migration SQL appliquée en dev + smoke test RLS
- [ ] 4 composants frontend fonctionnels avec polling
- [ ] Cron crypto exécutable manuellement
- [ ] 5 cas E2E passent
- [ ] Documentation utilisateur courte (1 page) dans `00-vision/` ou `06-sessions/`
- [ ] Pas de `console.log` ni TODO dans le code livré
- [ ] Typecheck + lint passent
- [ ] Performance : OCR <30s p95, crypto refresh <60s p95, modal open <300ms
