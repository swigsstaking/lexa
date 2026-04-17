-- Migration 017 — Index partiels pour la dedup bridge Pro → Lexa
-- Améliore les performances des lookups d'idempotence dans bridge.ts
-- Ces index sont partiels : ils ne couvrent que les events ayant un proInvoiceId/proExpenseId

CREATE INDEX IF NOT EXISTS idx_events_pro_invoice_id
  ON events ((metadata->>'proInvoiceId'))
  WHERE metadata->>'proInvoiceId' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_pro_expense_id
  ON events ((metadata->>'proExpenseId'))
  WHERE metadata->>'proExpenseId' IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('017_bridge_dedup_indexes')
  ON CONFLICT (version) DO NOTHING;
