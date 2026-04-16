-- Lexa — Brouillons de déclaration PM (personnes morales) — session 27
-- Table séparée de taxpayer_drafts car le schéma bilan/résultat PM est
-- fondamentalement différent du schéma revenus/déductions PP.
-- Un tenant peut avoir plusieurs drafts PM (1 par canton par année).
-- V1 : 1 société par canton. Mode fiduciaire multi-société = session 33.

CREATE TABLE IF NOT EXISTS company_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  year        INTEGER NOT NULL,
  canton      TEXT NOT NULL CHECK (canton IN ('VS','GE','VD','FR','NE','JU','BJ')),
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, year, canton)
);

CREATE INDEX IF NOT EXISTS company_drafts_tenant_year
  ON company_drafts (tenant_id, year);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_company_drafts_updated_at()
  RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS company_drafts_updated_at ON company_drafts;
CREATE TRIGGER company_drafts_updated_at
  BEFORE UPDATE ON company_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_company_drafts_updated_at();

INSERT INTO schema_migrations (version) VALUES ('007_company_drafts')
  ON CONFLICT (version) DO NOTHING;
