-- Migration 011 — Unique index on ledger_entries for REFRESH CONCURRENTLY
-- A UNIQUE index is required for pg to do non-locking concurrent refresh.
-- (event_id, line_type) is the natural PK: one TransactionClassified event
-- yields exactly two rows — one debit, one credit.

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_pk
  ON ledger_entries (event_id, line_type);

-- Update refresh helper to use CONCURRENTLY now that the index exists
CREATE OR REPLACE FUNCTION refresh_ledger_entries() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ledger_entries;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version) VALUES ('011_ledger_unique_index')
  ON CONFLICT (version) DO NOTHING;
