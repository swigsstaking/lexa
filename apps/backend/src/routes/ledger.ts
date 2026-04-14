import { Router } from "express";
import { z } from "zod";
import { query } from "../db/postgres.js";

export const ledgerRouter = Router();

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

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
    [DEFAULT_TENANT_ID, limit],
  );

  res.json({
    tenantId: DEFAULT_TENANT_ID,
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
    [DEFAULT_TENANT_ID, account, limit],
  );

  const balanceResult = await query<AccountBalanceRow>(
    `SELECT * FROM account_balance
     WHERE tenant_id = $1 AND account LIKE $2`,
    [DEFAULT_TENANT_ID, account],
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
    tenantId: DEFAULT_TENANT_ID,
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
    })),
  });
});

/** GET /ledger/balance — full trial balance (balance de vérification) */
ledgerRouter.get("/balance", async (_req, res) => {
  const result = await query<AccountBalanceRow>(
    `SELECT * FROM account_balance
     WHERE tenant_id = $1
     ORDER BY account`,
    [DEFAULT_TENANT_ID],
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
    tenantId: DEFAULT_TENANT_ID,
    accountsCount: accounts.length,
    accounts,
    totals: {
      debit: Number(totalDebit.toFixed(2)),
      credit: Number(totalCredit.toFixed(2)),
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    },
  });
});

/** POST /ledger/refresh — manually refresh the materialized view */
ledgerRouter.post("/refresh", async (_req, res) => {
  const started = Date.now();
  await query("SELECT refresh_ledger_entries()");
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ledger_entries WHERE tenant_id = $1`,
    [DEFAULT_TENANT_ID],
  );
  res.json({
    refreshedIn: Date.now() - started,
    entriesCount: Number(countResult.rows[0]?.count ?? 0),
  });
});
