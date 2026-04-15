-- Migration 006 — Profil contribuable persistant
-- Session 17 : permet de préremplir le Step 1 du wizard lors d'une nouvelle
-- déclaration (ex : 2027) à partir des données identité saisies l'année précédente.
-- 1 ligne par tenant (UNIQUE sur tenant_id).

CREATE TABLE IF NOT EXISTS taxpayer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  birth_date DATE,
  civil_status TEXT,
  commune TEXT,
  canton TEXT,
  children_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxpayer_profiles_tenant ON taxpayer_profiles(tenant_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_taxpayer_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_taxpayer_profile_updated_at ON taxpayer_profiles;

CREATE TRIGGER set_taxpayer_profile_updated_at
  BEFORE UPDATE ON taxpayer_profiles
  FOR EACH ROW EXECUTE FUNCTION update_taxpayer_profile_updated_at();
