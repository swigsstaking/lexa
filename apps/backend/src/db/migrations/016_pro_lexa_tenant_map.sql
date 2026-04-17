-- Migration 016 — Table pro_lexa_tenant_map (mapping hubUserId ↔ lexaTenantId)
--
-- Problème : quand Swigs Pro publie un event, il passe hubUserId (string non-UUID)
-- dans tenantId. Lexa doit résoudre le bon tenant Lexa pour la comptabilité.
--
-- Solution : table de mapping avec fallback chain :
--   1. Si tenantId est un UUID valide → l'utiliser direct (V1 comportement)
--   2. Sinon chercher dans pro_lexa_tenant_map
--   3. Sinon chercher dans users.external_sso_id ou email
--   4. Sinon DEFAULT_TENANT_ID (demo)
--
-- La table est auto-populée lors du premier match via external_sso_id
-- et peut être gérée manuellement via POST /admin/pro-lexa-mapping

CREATE TABLE IF NOT EXISTS pro_lexa_tenant_map (
  pro_hub_user_id   TEXT        PRIMARY KEY,
  lexa_tenant_id    UUID        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_lexa_tenant_map_lexa
  ON pro_lexa_tenant_map(lexa_tenant_id);

COMMENT ON TABLE pro_lexa_tenant_map IS
  'Mapping hubUserId Swigs Pro → tenantId Lexa. Auto-populé via external_sso_id ou géré manuellement.';

INSERT INTO schema_migrations (version) VALUES ('016_pro_lexa_tenant_map')
  ON CONFLICT (version) DO NOTHING;
