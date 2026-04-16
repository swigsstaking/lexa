-- Migration 008 : fiduciary_memberships — mode multi-clients fiduciaires
-- Session 32 — 2026-04-16
-- Relation N:M user ↔ tenant avec rôle (owner | fiduciary | viewer)
-- Backfill : utilisateurs existants deviennent owner de leur tenant

CREATE TABLE IF NOT EXISTS fiduciary_memberships (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  role        text NOT NULL CHECK (role IN ('owner', 'fiduciary', 'viewer')),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS fm_user   ON fiduciary_memberships(user_id);
CREATE INDEX IF NOT EXISTS fm_tenant ON fiduciary_memberships(tenant_id);

-- Backfill : les users existants avec un tenant_id deviennent owner de leur tenant
INSERT INTO fiduciary_memberships (user_id, tenant_id, role)
SELECT id, tenant_id, 'owner'
FROM users
WHERE tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;
