-- Migration 019 — Paramètres tenant (toggle Pro sync)
-- Phase 3 V1.1 — toggle Pro sync per-tenant côté Lexa

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id           UUID PRIMARY KEY,
  pro_sync_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  pro_sync_disabled_at TIMESTAMPTZ,
  pro_sync_disabled_reason TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_pro_sync
  ON tenant_settings(pro_sync_enabled) WHERE pro_sync_enabled = FALSE;

INSERT INTO schema_migrations (version) VALUES ('019_tenant_settings')
  ON CONFLICT (version) DO NOTHING;
