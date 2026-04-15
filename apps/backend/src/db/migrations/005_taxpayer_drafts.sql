-- Lexa — Brouillons de déclaration PP contribuable (session 15)
-- Le wizard contribuable persiste chaque champ au fil de la saisie.
-- Un draft par tenant par année fiscale (contrainte UNIQUE composite).
-- L'état complet est stocké en JSONB pour flexibilité (v1 schéma
-- VS-PP, v2+ GE-PP, etc. partagent la même table).
--
-- Chaque mutation champ émet aussi un event TaxpayerFieldUpdated dans
-- l'event store pour l'audit trail (whitepaper §2 event-sourcing).

CREATE TABLE IF NOT EXISTS taxpayer_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  fiscal_year   INTEGER NOT NULL,
  state         JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step  INTEGER NOT NULL DEFAULT 1,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_taxpayer_drafts_tenant
  ON taxpayer_drafts (tenant_id);

CREATE OR REPLACE FUNCTION update_taxpayer_drafts_updated_at()
  RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS taxpayer_drafts_updated_at ON taxpayer_drafts;
CREATE TRIGGER taxpayer_drafts_updated_at
  BEFORE UPDATE ON taxpayer_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_taxpayer_drafts_updated_at();

INSERT INTO schema_migrations (version) VALUES ('005_taxpayer_drafts')
  ON CONFLICT (version) DO NOTHING;
