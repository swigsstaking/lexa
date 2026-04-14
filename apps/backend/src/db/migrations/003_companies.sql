-- Lexa — Companies + users table (session 09)
-- Lexa as a standalone product: users onboard their company during first setup.
-- Each user has 1 primary company (for MVP). Multi-company later.

CREATE TABLE IF NOT EXISTS companies (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL UNIQUE,
  uid                   TEXT,                       -- CHE-XXX.XXX.XXX (nullable if manual entry)
  name                  TEXT NOT NULL,
  legal_form            TEXT NOT NULL,              -- sa | sarl | raison_individuelle | ...
  legal_form_label      TEXT,
  street                TEXT,
  zip                   TEXT,
  city                  TEXT,
  canton                TEXT,                       -- ISO 3166-2:CH (VS, GE, VD, ...)
  country               TEXT NOT NULL DEFAULT 'CH',
  email                 TEXT,
  phone                 TEXT,
  iban                  TEXT,
  qr_iban               TEXT,
  is_vat_subject        BOOLEAN NOT NULL DEFAULT TRUE,
  vat_number            TEXT,                       -- CHE-XXX.XXX.XXX MWST
  vat_declaration_frequency TEXT NOT NULL DEFAULT 'quarterly', -- quarterly|monthly|annual
  vat_method            TEXT NOT NULL DEFAULT 'effective',      -- effective|tdfn
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  employee_count        INTEGER NOT NULL DEFAULT 0,
  source                TEXT NOT NULL DEFAULT 'manual',          -- 'uid-register' | 'swigs-pro' | 'manual'
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_uid ON companies (uid);
CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies (tenant_id);

-- Update trigger
CREATE OR REPLACE FUNCTION update_companies_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_updated_at ON companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_companies_updated_at();

INSERT INTO schema_migrations (version) VALUES ('003_companies')
  ON CONFLICT (version) DO NOTHING;
