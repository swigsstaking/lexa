-- Migration 020 — Ajouter external_sso_id sur users pour le lien SSO Hub
-- Cette colonne stocke le hubId retourné par apps.swigs.online lors du SSO
-- et permet de retrouver un user Lexa à partir de son identité Hub.

ALTER TABLE users ADD COLUMN IF NOT EXISTS external_sso_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_sso_id
  ON users (external_sso_id)
  WHERE external_sso_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('020_users_external_sso_id')
  ON CONFLICT (version) DO NOTHING;
