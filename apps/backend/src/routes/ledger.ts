import { Router } from "express";
import { query } from "../db/postgres.js";
import {
  projectBalanceSheet,
  projectIncomeStatement,
  computeLedgerHealth,
} from "../services/ContinuousClosingService.js";

export const ledgerRouter = Router();

type LedgerEntryRow = {
  event_id: string;
  tenant_id: string;
  stream_id: string;
  occurred_at: Date;
  transaction_date: string | null;
  description: string | null;
  source: string | null;
  currency: string | null;
  debit_account: string;
  credit_account: string;
  amount_ttc: string;
  amount_ht: string;
  tva_rate: string;
  tva_code: string;
  confidence: string;
  line_type: "debit" | "credit";
  account: string;
  amount: string;
  document_id: string | null; // Pièce justificative OCR — drill-down (migration 012)
};

type AccountBalanceRow = {
  tenant_id: string;
  account: string;
  debit_count: string;
  credit_count: string;
  total_debit: string;
  total_credit: string;
  balance: string;
};

/** GET /ledger — all ledger entries for the default tenant */
ledgerRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const result = await query<LedgerEntryRow>(
    `SELECT * FROM ledger_entries
     WHERE tenant_id = $1
     ORDER BY occurred_at DESC, line_type
     LIMIT $2`,
    [req.tenantId, limit],
  );

  res.json({
    tenantId: req.tenantId,
    count: result.rows.length,
    entries: result.rows.map((r) => ({
      eventId: Number(r.event_id),
      streamId: r.stream_id,
      date: r.transaction_date,
      occurredAt: r.occurred_at,
      description: r.description,
      source: r.source,
      currency: r.currency,
      lineType: r.line_type,
      account: r.account,
      amount: Number(r.amount),
      counterpartAccount: r.line_type === "debit" ? r.credit_account : r.debit_account,
      amountHt: Number(r.amount_ht),
      amountTtc: Number(r.amount_ttc),
      tvaRate: Number(r.tva_rate),
      tvaCode: r.tva_code,
      confidence: Number(r.confidence),
      documentId: r.document_id ?? null,
    })),
  });
});

/** GET /ledger/account/:account — ledger entries for a specific account */
ledgerRouter.get("/account/:account", async (req, res) => {
  const accountParam = req.params.account ?? "";
  if (!accountParam || accountParam.length < 3) {
    return res.status(400).json({ error: "invalid account" });
  }
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const account = `${accountParam}%`;

  const result = await query<LedgerEntryRow>(
    `SELECT * FROM ledger_entries
     WHERE tenant_id = $1 AND account LIKE $2
     ORDER BY occurred_at DESC, line_type
     LIMIT $3`,
    [req.tenantId, account, limit],
  );

  const balanceResult = await query<AccountBalanceRow>(
    `SELECT * FROM account_balance
     WHERE tenant_id = $1 AND account LIKE $2`,
    [req.tenantId, account],
  );

  const summaryAccounts = balanceResult.rows.map((r) => ({
    account: r.account,
    debitCount: Number(r.debit_count),
    creditCount: Number(r.credit_count),
    totalDebit: Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    balance: Number(r.balance),
  }));

  res.json({
    tenantId: req.tenantId,
    accountPrefix: accountParam,
    count: result.rows.length,
    summary: summaryAccounts,
    entries: result.rows.map((r) => ({
      eventId: Number(r.event_id),
      streamId: r.stream_id,
      date: r.transaction_date,
      description: r.description,
      lineType: r.line_type,
      account: r.account,
      amount: Number(r.amount),
      counterpartAccount: r.line_type === "debit" ? r.credit_account : r.debit_account,
      amountHt: Number(r.amount_ht),
      amountTtc: Number(r.amount_ttc),
      tvaRate: Number(r.tva_rate),
      confidence: Number(r.confidence),
      documentId: r.document_id ?? null,
    })),
  });
});

/** GET /ledger/balance — full trial balance (balance de vérification) */
ledgerRouter.get("/balance", async (req, res) => {
  const result = await query<AccountBalanceRow>(
    `SELECT * FROM account_balance
     WHERE tenant_id = $1
     ORDER BY account`,
    [req.tenantId],
  );

  const accounts = result.rows.map((r) => ({
    account: r.account,
    debitCount: Number(r.debit_count),
    creditCount: Number(r.credit_count),
    totalDebit: Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    balance: Number(r.balance),
  }));

  const totalDebit = accounts.reduce((s, a) => s + a.totalDebit, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.totalCredit, 0);

  res.json({
    tenantId: req.tenantId,
    accountsCount: accounts.length,
    accounts,
    totals: {
      debit: Number(totalDebit.toFixed(2)),
      credit: Number(totalCredit.toFixed(2)),
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    },
  });
});

/**
 * GET /ledger/processing-status — count ingested vs classified transactions
 * Used by Workspace to show "IA classifie N transactions…" panel during
 * background classification (polling every 3s while pending > 0).
 */
ledgerRouter.get("/processing-status", async (req, res) => {
  const result = await query<{ ingested: string; classified: string }>(
    `SELECT
       (SELECT COUNT(*) FROM events WHERE tenant_id = $1 AND type = 'TransactionIngested') AS ingested,
       (SELECT COUNT(*) FROM events WHERE tenant_id = $1 AND type = 'TransactionClassified') AS classified`,
    [req.tenantId],
  );

  const ingested = Number(result.rows[0]?.ingested ?? 0);
  const classified = Number(result.rows[0]?.classified ?? 0);
  const pending = Math.max(0, ingested - classified);

  // Heuristic: ~10s per transaction (observed cadence after classifier quick-wins)
  const estimatedSecondsRemaining = pending * 10;

  res.json({ ingested, classified, pending, estimatedSecondsRemaining });
});

/** POST /ledger/refresh — manually refresh the materialized view */
ledgerRouter.post("/refresh", async (req, res) => {
  const started = Date.now();
  await query("SELECT refresh_ledger_entries()");
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ledger_entries WHERE tenant_id = $1`,
    [req.tenantId],
  );
  res.json({
    refreshedIn: Date.now() - started,
    entriesCount: Number(countResult.rows[0]?.count ?? 0),
  });
});

// ─── Continuous Closing endpoints (session 29) ────────────────────────────────

/** GET /ledger/balance-sheet/:year — projected balance sheet from event store */
ledgerRouter.get("/balance-sheet/:year", async (req, res) => {
  const year = parseInt(req.params.year ?? "", 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "invalid year — expected YYYY between 2000 and 2100" });
  }
  try {
    const result = await projectBalanceSheet(req.tenantId, year);
    res.json(result);
  } catch (err) {
    console.error("balance-sheet projection error:", err);
    res.status(500).json({ error: "projection failed", message: (err as Error).message });
  }
});

/** GET /ledger/income-statement/:year — projected income statement from event store */
ledgerRouter.get("/income-statement/:year", async (req, res) => {
  const year = parseInt(req.params.year ?? "", 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "invalid year — expected YYYY between 2000 and 2100" });
  }
  try {
    const result = await projectIncomeStatement(req.tenantId, year);
    res.json(result);
  } catch (err) {
    console.error("income-statement projection error:", err);
    res.status(500).json({ error: "projection failed", message: (err as Error).message });
  }
});

/** GET /ledger/health/:year — ledger health indicators (CO 958c) */
ledgerRouter.get("/health/:year", async (req, res) => {
  const year = parseInt(req.params.year ?? "", 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "invalid year — expected YYYY between 2000 and 2100" });
  }
  try {
    const result = await computeLedgerHealth(req.tenantId, year);
    res.json(result);
  } catch (err) {
    console.error("ledger-health error:", err);
    res.status(500).json({ error: "health check failed", message: (err as Error).message });
  }
});
