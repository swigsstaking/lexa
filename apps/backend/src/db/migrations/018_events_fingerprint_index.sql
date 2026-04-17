-- Migration 018 — Index fingerprint pour dedup transactions bancaires
CREATE INDEX IF NOT EXISTS idx_events_fingerprint
  ON events ((metadata->>'fingerprint'), tenant_id)
  WHERE metadata->>'fingerprint' IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('018_events_fingerprint_index')
  ON CONFLICT (version) DO NOTHING;
