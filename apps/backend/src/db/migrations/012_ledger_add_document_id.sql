-- Migration 012 — Ajouter document_id à ledger_entries (drill-down pièce justificative)
--
-- Stratégie :
--   1. Lire metadata->>'documentId' depuis l'event TransactionIngested du même stream
--   2. Exposer document_id dans la matview pour que l'API ledger puisse le retourner
--
-- ATTENTION : DROP CASCADE supprime les indexes → les recréer obligatoirement
-- CRITIQUE : ux_ledger_entries_pk doit exister pour REFRESH CONCURRENTLY (LedgerRefresh.ts)

DROP MATERIALIZED VIEW IF EXISTS ledger_entries CASCADE;

CREATE MATERIALIZED VIEW ledger_entries AS
WITH classified AS (
  SELECT
    e.id                                         AS event_id,
    e.tenant_id,
    e.stream_id,
    e.occurred_at,
    e.payload->>'transactionStreamId'            AS transaction_stream_id,
    e.payload->>'debitAccount'                   AS debit_account,
    e.payload->>'creditAccount'                  AS credit_account,
    (e.payload->>'amountTtc')::numeric(14, 2)    AS amount_ttc,
    (e.payload->>'amountHt')::numeric(14, 2)     AS amount_ht,
    (e.payload->>'tvaRate')::numeric(4, 2)       AS tva_rate,
    e.payload->>'tvaCode'                        AS tva_code,
    (e.payload->>'confidence')::numeric(5, 4)    AS confidence,
    e.payload->>'costCenter'                     AS cost_center
  FROM events e
  WHERE e.type = 'TransactionClassified'
),
ingested AS (
  SELECT
    e.stream_id,
    e.payload->>'description'                    AS description,
    (e.payload->>'date')::date                   AS transaction_date,
    (e.payload->>'amount')::numeric(14, 2)       AS bank_amount,
    e.payload->>'currency'                       AS currency,
    e.payload->>'source'                         AS source,
    e.metadata->>'documentId'                    AS document_id
  FROM events e
  WHERE e.type = 'TransactionIngested'
)
SELECT
  c.event_id,
  c.tenant_id,
  c.stream_id,
  c.occurred_at,
  i.transaction_date,
  i.description,
  i.source,
  i.currency,
  c.debit_account,
  c.credit_account,
  c.amount_ttc,
  c.amount_ht,
  c.tva_rate,
  c.tva_code,
  c.cost_center,
  c.confidence,
  i.document_id,
  -- Double entry lines (one row per line so we can filter by account)
  'debit' AS line_type,
  c.debit_account AS account,
  c.amount_ttc AS amount
FROM classified c
LEFT JOIN ingested i ON i.stream_id = c.stream_id

UNION ALL

SELECT
  c.event_id,
  c.tenant_id,
  c.stream_id,
  c.occurred_at,
  i.transaction_date,
  i.description,
  i.source,
  i.currency,
  c.debit_account,
  c.credit_account,
  c.amount_ttc,
  c.amount_ht,
  c.tva_rate,
  c.tva_code,
  c.cost_center,
  c.confidence,
  i.document_id,
  'credit' AS line_type,
  c.credit_account AS account,
  c.amount_ttc AS amount
FROM classified c
LEFT JOIN ingested i ON i.stream_id = c.stream_id;

-- Recréation obligatoire des indexes (CASCADE les a supprimés)
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_account
  ON ledger_entries (tenant_id, account);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_date
  ON ledger_entries (transaction_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_stream
  ON ledger_entries (stream_id);

-- CRITIQUE : index unique requis pour REFRESH CONCURRENTLY (LedgerRefresh.ts)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_pk
  ON ledger_entries (event_id, line_type);

-- Mettre à jour la fonction refresh pour utiliser CONCURRENTLY
CREATE OR REPLACE FUNCTION refresh_ledger_entries() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ledger_entries;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version) VALUES ('012_ledger_add_document_id')
  ON CONFLICT (version) DO NOTHING;
