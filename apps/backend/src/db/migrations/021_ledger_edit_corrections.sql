-- Migration 021 — Grand livre éditorial : corrections, lettrage, historique
--
-- Étend la matview ledger_entries avec :
--   - letter_ref TEXT     : dernier letterRef actif (NULL si délettré ou jamais lettré)
--   - corrected BOOLEAN   : TRUE si au moins un TransactionCorrected existe dans ce stream
--   - last_reasoning TEXT : dernier reasoning (correction manuelle ou création manuelle)
--
-- Stratégie corrections :
--   Prendre le dernier TransactionCorrected (DISTINCT ON stream_id ORDER BY occurred_at DESC)
--   COALESCE avec le TransactionClassified initial pour les champs non overridés.
--
-- Stratégie lettrage :
--   Compter Lettered vs Unlettered par stream : si Lettered > Unlettered → actif
--   → exposer le letterRef du dernier TransactionsLettered
--
-- ATTENTION : DROP CASCADE supprime account_balance + tous les indexes → recréer obligatoirement
-- CRITIQUE : ux_ledger_entries_pk doit exister pour REFRESH CONCURRENTLY (LedgerRefresh.ts)
-- CRITIQUE : account_balance VIEW doit être recréée après CASCADE

DROP MATERIALIZED VIEW IF EXISTS ledger_entries CASCADE;

CREATE MATERIALIZED VIEW ledger_entries AS
WITH classified_base AS (
  -- TransactionClassified initial : base de la classification IA
  SELECT
    e.id                                          AS event_id,
    e.tenant_id,
    e.stream_id,
    e.occurred_at,
    e.payload->>'transactionStreamId'             AS transaction_stream_id,
    e.payload->>'debitAccount'                    AS debit_account,
    e.payload->>'creditAccount'                   AS credit_account,
    (e.payload->>'amountTtc')::numeric(14, 2)     AS amount_ttc,
    (e.payload->>'amountHt')::numeric(14, 2)      AS amount_ht,
    (e.payload->>'tvaRate')::numeric(4, 2)        AS tva_rate,
    e.payload->>'tvaCode'                         AS tva_code,
    (e.payload->>'confidence')::numeric(5, 4)     AS confidence,
    e.payload->>'costCenter'                      AS cost_center,
    e.payload->>'reasoning'                       AS reasoning
  FROM events e
  WHERE e.type = 'TransactionClassified'
),
corrections AS (
  -- Dernière correction par stream (une seule ligne par stream_id)
  SELECT DISTINCT ON (e.stream_id)
    e.stream_id,
    e.payload->>'debitAccount'                    AS debit_account,
    e.payload->>'creditAccount'                   AS credit_account,
    (e.payload->>'amountTtc')::numeric(14, 2)     AS amount_ttc,
    e.payload->>'description'                     AS description,
    e.payload->>'reasoning'                       AS reasoning
  FROM events e
  WHERE e.type = 'TransactionCorrected'
  ORDER BY e.stream_id, e.occurred_at DESC
),
ingested AS (
  SELECT
    e.stream_id,
    e.payload->>'description'                     AS description,
    (e.payload->>'date')::date                    AS transaction_date,
    (e.payload->>'amount')::numeric(14, 2)        AS bank_amount,
    e.payload->>'currency'                        AS currency,
    e.payload->>'source'                          AS source,
    e.metadata->>'documentId'                     AS document_id,
    e.metadata->>'reconciles'                     AS reconciles,
    e.payload->>'reasoning'                       AS manual_reasoning
  FROM events e
  WHERE e.type = 'TransactionIngested'
),
lettrage AS (
  -- Dernier état de lettrage par stream
  -- Actif si COUNT(Lettered) > COUNT(Unlettered)
  SELECT
    sub.stream_id,
    CASE
      WHEN COUNT(*) FILTER (WHERE sub.type = 'TransactionsLettered')
         > COUNT(*) FILTER (WHERE sub.type = 'TransactionsUnlettered')
      THEN (
        SELECT e2.payload->>'letterRef'
        FROM events e2
        WHERE e2.stream_id = sub.stream_id
          AND e2.type = 'TransactionsLettered'
        ORDER BY e2.occurred_at DESC
        LIMIT 1
      )
      ELSE NULL
    END AS letter_ref
  FROM events sub
  WHERE sub.type IN ('TransactionsLettered', 'TransactionsUnlettered')
  GROUP BY sub.stream_id
),
corrected_flag AS (
  -- Streams qui ont au moins une correction
  SELECT DISTINCT stream_id
  FROM events
  WHERE type = 'TransactionCorrected'
)
SELECT
  c.event_id,
  c.tenant_id,
  c.stream_id,
  c.occurred_at,
  i.transaction_date,
  -- Description : override correction si précisée, sinon ingested
  COALESCE(corr.description, i.description)                    AS description,
  i.source,
  i.currency,
  -- Classification finale : COALESCE(correction, base IA)
  COALESCE(corr.debit_account,  c.debit_account)               AS debit_account,
  COALESCE(corr.credit_account, c.credit_account)              AS credit_account,
  COALESCE(corr.amount_ttc,     c.amount_ttc)                  AS amount_ttc,
  c.amount_ht,
  c.tva_rate,
  c.tva_code,
  c.cost_center,
  c.confidence,
  i.document_id,
  i.reconciles,
  -- Nouvelles colonnes V1.1
  l.letter_ref,
  (cf.stream_id IS NOT NULL)                                   AS corrected,
  COALESCE(corr.reasoning, i.manual_reasoning, c.reasoning)   AS last_reasoning,
  -- Double entry — ligne débit
  'debit'                                                      AS line_type,
  COALESCE(corr.debit_account, c.debit_account)               AS account,
  COALESCE(corr.amount_ttc, c.amount_ttc)                     AS amount
FROM classified_base c
LEFT JOIN ingested     i    ON i.stream_id    = c.stream_id
LEFT JOIN corrections  corr ON corr.stream_id = c.stream_id
LEFT JOIN lettrage     l    ON l.stream_id    = c.stream_id
LEFT JOIN corrected_flag cf ON cf.stream_id   = c.stream_id

UNION ALL

SELECT
  c.event_id,
  c.tenant_id,
  c.stream_id,
  c.occurred_at,
  i.transaction_date,
  COALESCE(corr.description, i.description)                    AS description,
  i.source,
  i.currency,
  COALESCE(corr.debit_account,  c.debit_account)               AS debit_account,
  COALESCE(corr.credit_account, c.credit_account)              AS credit_account,
  COALESCE(corr.amount_ttc,     c.amount_ttc)                  AS amount_ttc,
  c.amount_ht,
  c.tva_rate,
  c.tva_code,
  c.cost_center,
  c.confidence,
  i.document_id,
  i.reconciles,
  -- Nouvelles colonnes V1.1
  l.letter_ref,
  (cf.stream_id IS NOT NULL)                                   AS corrected,
  COALESCE(corr.reasoning, i.manual_reasoning, c.reasoning)   AS last_reasoning,
  -- Double entry — ligne crédit
  'credit'                                                     AS line_type,
  COALESCE(corr.credit_account, c.credit_account)             AS account,
  COALESCE(corr.amount_ttc, c.amount_ttc)                     AS amount
FROM classified_base c
LEFT JOIN ingested     i    ON i.stream_id    = c.stream_id
LEFT JOIN corrections  corr ON corr.stream_id = c.stream_id
LEFT JOIN lettrage     l    ON l.stream_id    = c.stream_id
LEFT JOIN corrected_flag cf ON cf.stream_id   = c.stream_id;

-- ── Index (CASCADE les a tous supprimés → recréation obligatoire) ────────────

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_account
  ON ledger_entries (tenant_id, account);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_date
  ON ledger_entries (transaction_date);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_stream
  ON ledger_entries (stream_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_reconciles
  ON ledger_entries (reconciles) WHERE reconciles IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_letter_ref
  ON ledger_entries (letter_ref) WHERE letter_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_corrected
  ON ledger_entries (tenant_id, corrected) WHERE corrected = TRUE;

-- CRITIQUE : index unique requis pour REFRESH CONCURRENTLY (LedgerRefresh.ts)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_pk
  ON ledger_entries (event_id, line_type);

-- ── Fonction refresh (CONCURRENTLY) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_ledger_entries() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ledger_entries;
END;
$$ LANGUAGE plpgsql;

-- ── account_balance VIEW (CASCADE l'a supprimée → recréation obligatoire) ────
CREATE OR REPLACE VIEW account_balance AS
SELECT
  tenant_id,
  account,
  COUNT(*) FILTER (WHERE line_type = 'debit')   AS debit_count,
  COUNT(*) FILTER (WHERE line_type = 'credit')  AS credit_count,
  COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'),  0) AS total_debit,
  COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS total_credit,
  COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'),  0)
    - COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS balance
FROM ledger_entries
GROUP BY tenant_id, account;

-- ── Migration tracker ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('021_ledger_edit_corrections')
  ON CONFLICT (version) DO NOTHING;
