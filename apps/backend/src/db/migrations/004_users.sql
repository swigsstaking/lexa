-- Lexa — Users + auth (session 14)
-- Single-user / single-company par défaut. tenant_id vient de la company
-- créée à l'inscription. Mode fiduciaire multi-clients = session 16+.
--
-- verified est stocké mais ignoré par requireAuth en v1 — permettra de
-- brancher Postmark ultérieurement sans migration supplémentaire.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  verified       BOOLEAN NOT NULL DEFAULT false,
  tenant_id      UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

INSERT INTO schema_migrations (version) VALUES ('004_users')
  ON CONFLICT (version) DO NOTHING;
