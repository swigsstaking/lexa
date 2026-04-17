-- Migration 015 — Ajouter reconciles à ledger_entries (lien facture ↔ paiement)
--
-- Stratégie :
--   1. Lire metadata->>'reconciles' depuis l'event TransactionIngested du même stream
--      Ce champ pointe vers le stream_id de la facture originale (invoice.created)
--      pour les events de paiement (invoice.paid)
--   2. Exposer reconciles dans la matview pour que le frontend puisse afficher
--      visuellement le lien "facture ↔ paiement"
--
-- ATTENTION : DROP CASCADE supprime account_balance + tous les indexes → les recréer obligatoirement
-- CRITIQUE : ux_ledger_entries_pk doit exister pour REFRESH CONCURRENTLY (LedgerRefresh.ts)
-- CRITIQUE : account_balance VIEW doit être recréée après CASCADE (dette connue commit 1d0add2)

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
    e.metadata->>'documentId'                    AS document_id,
    e.metadata->>'reconciles'                    AS reconciles  -- NEW: lien vers stream_id de la facture originale
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
  i.reconciles,
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
  i.reconciles,
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

-- Index sur reconciles pour les lookups de lien facture↔paiement
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reconciles
  ON ledger_entries (reconciles) WHERE reconciles IS NOT NULL;

-- CRITIQUE : index unique requis pour REFRESH CONCURRENTLY (LedgerRefresh.ts)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_pk
  ON ledger_entries (event_id, line_type);

-- Mettre à jour la fonction refresh pour utiliser CONCURRENTLY
CREATE OR REPLACE FUNCTION refresh_ledger_entries() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ledger_entries;
END;
$$ LANGUAGE plpgsql;

-- CRITIQUE : recréer account_balance VIEW (droppée par le CASCADE ci-dessus, car dépendante de ledger_entries)
CREATE OR REPLACE VIEW account_balance AS
SELECT
  tenant_id,
  account,
  COUNT(*) FILTER (WHERE line_type = 'debit')  AS debit_count,
  COUNT(*) FILTER (WHERE line_type = 'credit') AS credit_count,
  COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)  AS total_debit,
  COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS total_credit,
  COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)
    - COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS balance
FROM ledger_entries
GROUP BY tenant_id, account;

INSERT INTO schema_migrations (version) VALUES ('015_ledger_add_reconciles')
  ON CONFLICT (version) DO NOTHING;
