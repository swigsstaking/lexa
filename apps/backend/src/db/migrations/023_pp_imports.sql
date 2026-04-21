-- Migration 023 — pp_imports : événements d'import documents PP (OCR pipeline)
-- Agent B1 — P1.B.B1 : backend OCR pipeline modal import PP
-- NE contient PAS pp_crypto_* (Agent B2)

CREATE TABLE IF NOT EXISTS pp_imports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  user_id            UUID NOT NULL,
  category           TEXT NOT NULL CHECK (category IN (
    'salary', 'wealth', 'investment', 'expense', 'insurance', 'crypto', 'auto'
  )),
  source_type        TEXT NOT NULL CHECK (source_type IN ('upload', 'crypto_wallet', 'manual')),
  source_url         TEXT,                  -- chemin local /var/lexa/uploads/<tenant_id>/<id>.<ext>
  source_meta        JSONB DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'extracted', 'validated', 'committed', 'failed'
  )),
  raw_extraction     JSONB,                 -- output brut du modèle OCR
  validated_data     JSONB,                 -- données après validation humaine
  confidence         NUMERIC(3,2),          -- 0.00-1.00
  wizard_step_target TEXT,                  -- 'Step2Revenues' | 'Step3Wealth' | 'Step4Deductions'
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_imports_tenant_status ON pp_imports(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pp_imports_user ON pp_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_pp_imports_tenant_created ON pp_imports(tenant_id, created_at DESC);

-- RLS obligatoire (règle absolue Lexa)
ALTER TABLE pp_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_imports FORCE ROW LEVEL SECURITY;

CREATE POLICY pp_imports_tenant_isolation ON pp_imports
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

INSERT INTO schema_migrations (version) VALUES ('023_pp_imports')
  ON CONFLICT (version) DO NOTHING;
