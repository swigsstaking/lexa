-- Migration 022 — PP income/expense/savings entries
-- Tables de saisie PP pour le workspace Personne Physique.
-- Chaque entrée correspond à un poste budgétaire catégorisé.

CREATE TABLE IF NOT EXISTS pp_income_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  fiscal_year   INTEGER NOT NULL,
  category_code TEXT NOT NULL,
  label         TEXT NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  count         INTEGER NOT NULL DEFAULT 1,
  entry_date    DATE,
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'camt', 'ocr')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_income_tenant_year
  ON pp_income_entries (tenant_id, fiscal_year);

ALTER TABLE pp_income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_income_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_pp_income ON pp_income_entries
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pp_expense_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  fiscal_year   INTEGER NOT NULL,
  category_code TEXT NOT NULL,
  label         TEXT NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  count         INTEGER NOT NULL DEFAULT 1,
  entry_date    DATE,
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'camt', 'ocr')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_expense_tenant_year
  ON pp_expense_entries (tenant_id, fiscal_year);

ALTER TABLE pp_expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_expense_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_pp_expense ON pp_expense_entries
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pp_savings_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  fiscal_year   INTEGER NOT NULL,
  category_code TEXT NOT NULL,
  label         TEXT NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  count         INTEGER NOT NULL DEFAULT 1,
  entry_date    DATE,
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'camt', 'ocr')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_savings_tenant_year
  ON pp_savings_entries (tenant_id, fiscal_year);

ALTER TABLE pp_savings_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_savings_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_pp_savings ON pp_savings_entries
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- ── Seed demo data — tenant Demo V2 SA (47eddb05-d46b-48cd-ad23-698cc30d1d89) ──
-- Correspond aux valeurs hardcodées de PP_DATA dans PpWorkspace.tsx.
-- Superuser bypass RLS → INSERT direct sans set_config.

INSERT INTO pp_income_entries (tenant_id, fiscal_year, category_code, label, amount, count, source)
VALUES
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'S01', 'Salaire net annuel',   102000, 12, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'S02', '13ème salaire',           8500,  1, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'S03', 'Bonus de performance',    6000,  1, 'manual')
ON CONFLICT DO NOTHING;

INSERT INTO pp_expense_entries (tenant_id, fiscal_year, category_code, label, amount, count, source)
VALUES
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'V01', 'Logement',           21600, 12, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'V02', 'Assurance maladie',   5280, 12, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'V03', 'Alimentation',        12400, 52, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'V04', 'Transports',           4320, 36, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'V05', 'Loisirs & voyages',    5000, 14, 'manual')
ON CONFLICT DO NOTHING;

INSERT INTO pp_savings_entries (tenant_id, fiscal_year, category_code, label, amount, count, source)
VALUES
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'E01', '3e pilier A',   7056,  1, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'E02', 'Épargne libre', 8400, 12, 'manual'),
  ('47eddb05-d46b-48cd-ad23-698cc30d1d89', 2026, 'E03', 'LPP — rachat',  3000,  1, 'manual')
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('022_pp_income_entries')
  ON CONFLICT (version) DO NOTHING;
