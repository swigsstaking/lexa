/**
 * Routes settings — Paramètres tenant (email forward, intégrations Pro, etc.)
 *
 * GET    /settings/email-forward              → config email forward (token, adresse, historique)
 * POST   /settings/email-forward/regenerate  → nouveau token
 * PATCH  /settings/email-forward/toggle      → activer/désactiver
 * GET    /settings/email-forward/history     → 20 derniers emails reçus
 *
 * GET    /settings/integrations/pro          → état du toggle Pro sync
 * PUT    /settings/integrations/pro          → activer/désactiver le sync Pro
 * POST   /settings/integrations/pro/sync     → import bulk historique Pro → Lexa
 * GET    /settings/integrations/pro/stats    → stats events Pro ingérés
 *
 * Phase 1 V1.2 — email forward IMAP.
 * Phase 3 V1.1 — toggle Pro sync per-tenant.
 * V1.1 Feature — import bulk + dashboard stats.
 */

import { Router } from "express";
import { randomBytes } from "node:crypto";
import axios from "axios";
import { query, queryAsTenant } from "../db/postgres.js";
import { getProSyncSettings, setProSyncEnabled } from "../services/TenantSettings.js";
import { scheduleLedgerRefresh } from "../services/LedgerRefresh.js";
import {
  handleInvoiceCreated,
  handleInvoiceSent,
  handleInvoicePaid,
  handleExpenseSubmitted,
  handleBankTransaction,
} from "./bridge.js";

export const settingsRouter = Router();

// GET /settings/email-forward
settingsRouter.get("/email-forward", async (req, res) => {
  const tenantId = req.tenantId!;

  const { rows } = await queryAsTenant<{
    token: string;
    enabled: boolean;
    last_email_at: string | null;
  }>(
    tenantId,
    `SELECT token, enabled, last_email_at FROM tenant_email_tokens WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );

  let token = rows[0]?.token;
  let enabled = rows[0]?.enabled ?? false;
  const lastEmailAt = rows[0]?.last_email_at ?? null;

  // Auto-créer le token si premier accès
  if (!token) {
    token = randomBytes(6).toString("hex"); // 12 chars hex
    await queryAsTenant(
      tenantId,
      `INSERT INTO tenant_email_tokens (tenant_id, token, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId, token],
    );
    enabled = true;
  }

  const base = process.env.EMAIL_FORWARD_BASE ?? "mail@swigs.online";
  const atIdx = base.lastIndexOf("@");
  const local = base.slice(0, atIdx);
  const domain = base.slice(atIdx + 1);
  const forwardAddress = `${local}+${token}@${domain}`;

  return res.json({ token, enabled, forwardAddress, lastEmailAt });
});

// POST /settings/email-forward/regenerate
settingsRouter.post("/email-forward/regenerate", async (req, res) => {
  const tenantId = req.tenantId!;
  const newToken = randomBytes(6).toString("hex");

  await queryAsTenant(
    tenantId,
    `INSERT INTO tenant_email_tokens (tenant_id, token, enabled)
     VALUES ($1, $2, true)
     ON CONFLICT (tenant_id) DO UPDATE SET token = EXCLUDED.token, updated_at = now()`,
    [tenantId, newToken],
  );

  const base = process.env.EMAIL_FORWARD_BASE ?? "mail@swigs.online";
  const atIdx = base.lastIndexOf("@");
  const local = base.slice(0, atIdx);
  const domain = base.slice(atIdx + 1);
  const forwardAddress = `${local}+${newToken}@${domain}`;

  return res.json({ token: newToken, forwardAddress });
});

// PATCH /settings/email-forward/toggle
settingsRouter.patch("/email-forward/toggle", async (req, res) => {
  const tenantId = req.tenantId!;
  const { enabled } = req.body as { enabled?: unknown };

  await queryAsTenant(
    tenantId,
    `UPDATE tenant_email_tokens SET enabled = $1, updated_at = now() WHERE tenant_id = $2`,
    [Boolean(enabled), tenantId],
  );

  return res.json({ ok: true, enabled: Boolean(enabled) });
});

// ── Intégrations Pro (Phase 3 V1.1) ──────────────────────────────────────────

// GET /settings/integrations/pro
settingsRouter.get("/integrations/pro", async (req, res) => {
  const tenantId = req.tenantId!;
  try {
    const settings = await getProSyncSettings(tenantId);
    return res.json(settings);
  } catch (err) {
    console.error("[settings] integrations/pro GET error:", (err as Error).message);
    return res.status(500).json({ error: "get failed", message: (err as Error).message });
  }
});

// PUT /settings/integrations/pro
settingsRouter.put("/integrations/pro", async (req, res) => {
  const tenantId = req.tenantId!;
  const { enabled, reason } = req.body as { enabled?: unknown; reason?: unknown };

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }
  const reasonStr = typeof reason === "string" ? reason : undefined;

  try {
    await setProSyncEnabled(tenantId, enabled, reasonStr);
    const settings = await getProSyncSettings(tenantId);
    return res.json({ ok: true, ...settings });
  } catch (err) {
    console.error("[settings] integrations/pro PUT error:", (err as Error).message);
    return res.status(500).json({ error: "update failed", message: (err as Error).message });
  }
});

// GET /settings/email-forward/history?limit=20
settingsRouter.get("/email-forward/history", async (req, res) => {
  const tenantId = req.tenantId!;
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  const { rows } = await queryAsTenant<{
    id: string;
    from_address: string;
    subject: string;
    attachments_count: number;
    received_at: string;
    status: string;
  }>(
    tenantId,
    `SELECT id, from_address, subject, attachments_count, received_at, status
     FROM email_forward_history
     WHERE tenant_id = $1
     ORDER BY received_at DESC
     LIMIT $2`,
    [tenantId, limit],
  );

  return res.json({ emails: rows });
});

// ── Import bulk Pro → Lexa (V1.1 Feature) ────────────────────────────────────

// POST /settings/integrations/pro/sync
settingsRouter.post("/integrations/pro/sync", async (req, res) => {
  const tenantId = req.tenantId!;

  // V1.1 SSO — PRIORITÉ : hubUserId vérifié depuis le JWT (cryptographiquement sûr)
  // FALLBACK 1 : users.external_sso_id (populé lors d'un login Hub passé)
  // FALLBACK 2 : hubUserId fourni dans le body (mode beta legacy, warn + log)
  const jwtHubUserId = (req.user as { hubUserId?: string } | undefined)?.hubUserId;
  const bodyHubUserId = (req.body?.hubUserId as string | undefined)?.trim();
  const userSub = (req.user as { sub?: string } | undefined)?.sub;

  let hubUserIdSource: "jwt" | "external_sso_id" | "body" | "mapping" | null = null;
  let resolvedHubUserId: string | undefined;

  if (jwtHubUserId) {
    resolvedHubUserId = jwtHubUserId;
    hubUserIdSource = "jwt";
  } else if (userSub) {
    const { rows: ssoRows } = await query<{ external_sso_id: string | null }>(
      `SELECT external_sso_id FROM users WHERE id = $1 LIMIT 1`,
      [userSub],
    );
    const ssoId = ssoRows[0]?.external_sso_id?.trim();
    if (ssoId) {
      resolvedHubUserId = ssoId;
      hubUserIdSource = "external_sso_id";
    }
  }
  if (!resolvedHubUserId && bodyHubUserId) {
    resolvedHubUserId = bodyHubUserId;
    hubUserIdSource = "body";
    console.warn(
      `[pro-sync] unsafe mode: user=${userSub} provided hubUserId=${bodyHubUserId} without SSO link. Beta-only, remove before GA.`,
    );
  }

  // Récupérer le mapping existant en base (source de vérité post-succès)
  const { rows } = await query<{ pro_hub_user_id: string }>(
    `SELECT pro_hub_user_id FROM pro_lexa_tenant_map WHERE lexa_tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  const mappedHubUserId = rows[0]?.pro_hub_user_id;
  // Ordre de priorité : mapping persisté > JWT/SSO > external_sso_id > body (beta)
  const hubUserId = mappedHubUserId ?? resolvedHubUserId;
  if (mappedHubUserId) hubUserIdSource = "mapping";

  if (!hubUserId) {
    return res.status(400).json({
      error: "no_hub_user_id",
      message:
        "Lier votre compte au Swigs Hub via /login (connexion SSO), ou fournir hubUserId en body — mode beta uniquement.",
    });
  }

  // Fetch export bulk depuis Swigs Pro
  const PRO_URL = process.env.PRO_URL ?? "https://swigs.online";
  const APP_SECRET = process.env.APP_SECRET ?? process.env.LEXA_INTERNAL_SECRET;
  if (!APP_SECRET) {
    return res.status(500).json({ error: "APP_SECRET not configured" });
  }

  let proData: {
    invoices?: Record<string, unknown>[];
    expenses?: Record<string, unknown>[];
  };
  try {
    const r = await axios.get(`${PRO_URL}/api/integrations/lexa/export`, {
      headers: { "X-App-Secret": APP_SECRET, "X-Hub-User-Id": hubUserId },
      timeout: 30_000,
    });
    proData = r.data as typeof proData;
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    const proStatus = e.response?.status;
    if (proStatus === 404) {
      return res.status(404).json({
        error: "hub_user_not_found_in_pro",
        message:
          "Aucun compte Swigs Pro trouvé pour votre identifiant Hub. Vérifiez que vous utilisez bien le même compte sur Pro et Lexa, ou connectez-vous via Swigs Hub SSO.",
        hubUserIdSource,
      });
    }
    return res.status(502).json({
      error: "pro export failed",
      proStatus,
      message: e.message,
    });
  }

  // Persister le mapping SEULEMENT après succès export — évite les mappings pourris
  if (!mappedHubUserId && resolvedHubUserId) {
    await query(
      `INSERT INTO pro_lexa_tenant_map (pro_hub_user_id, lexa_tenant_id) VALUES ($1, $2)
       ON CONFLICT (pro_hub_user_id) DO UPDATE SET lexa_tenant_id = EXCLUDED.lexa_tenant_id`,
      [resolvedHubUserId, tenantId],
    );
  }

  // Ingérer via les handlers existants (idempotent grâce à la dedup proInvoiceId)
  let invIngested = 0, invSentIngested = 0, paidIngested = 0, expIngested = 0, bankIngested = 0;
  const now = new Date().toISOString();

  for (const inv of proData.invoices ?? []) {
    try {
      await handleInvoiceCreated(tenantId, inv, (inv.createdAt as string) ?? now);
      invIngested++;
      if (inv.sentAt || inv.status === "sent" || inv.status === "paid") {
        await handleInvoiceSent(
          tenantId,
          { ...inv, sentAt: inv.sentAt ?? inv.createdAt },
          (inv.sentAt as string) ?? now,
        );
        invSentIngested++;
      }
      if (inv.paidAt || inv.status === "paid") {
        await handleInvoicePaid(
          tenantId,
          { ...inv, paidAt: inv.paidAt ?? now },
          (inv.paidAt as string) ?? now,
        );
        paidIngested++;
      }
    } catch (e) {
      console.warn(`[pro-sync] invoice ${inv.invoiceId} failed:`, (e as Error).message);
    }
  }

  for (const exp of proData.expenses ?? []) {
    try {
      await handleExpenseSubmitted(tenantId, exp, (exp.submittedAt as string) ?? now);
      expIngested++;
    } catch (e) {
      console.warn(`[pro-sync] expense ${exp.expenseId} failed:`, (e as Error).message);
    }
  }

  for (const tx of (proData as { bankTransactions?: Record<string, unknown>[] }).bankTransactions ?? []) {
    try {
      await handleBankTransaction(tenantId, tx, (tx.date as string) ?? now);
      bankIngested++;
    } catch (e) {
      console.warn(`[pro-sync] bankTx ${tx.bankTxId} failed:`, (e as Error).message);
    }
  }

  scheduleLedgerRefresh(tenantId);

  return res.json({
    ok: true,
    hubUserId,
    invoicesProcessed: proData.invoices?.length ?? 0,
    expensesProcessed: proData.expenses?.length ?? 0,
    bankTxProcessed: (proData as { bankTransactions?: unknown[] }).bankTransactions?.length ?? 0,
    ingested: {
      created: invIngested,
      sent: invSentIngested,
      paid: paidIngested,
      expenses: expIngested,
      bankTransactions: bankIngested,
    },
  });
});

// GET /settings/integrations/pro/stats
settingsRouter.get("/integrations/pro/stats", async (req, res) => {
  const tenantId = req.tenantId!;

  const { rows: counts } = await queryAsTenant<{ event: string; n: string; sum: string }>(
    tenantId,
    `SELECT
       metadata->>'proEvent' AS event,
       COUNT(*)::text AS n,
       COALESCE(SUM((metadata->>'proAmountTtc')::numeric), 0)::text AS sum
     FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionIngested'
       AND metadata->>'source' = 'swigs-pro'
     GROUP BY metadata->>'proEvent'`,
    [tenantId],
  );

  // Bank transactions ont source = 'swigs-pro-bank' — requête séparée
  const { rows: bankCounts } = await queryAsTenant<{ n: string; sum_in: string; sum_out: string }>(
    tenantId,
    `SELECT
       COUNT(*)::text AS n,
       COALESCE(SUM(CASE WHEN (payload->>'amount')::numeric > 0 THEN (payload->>'amount')::numeric ELSE 0 END), 0)::text AS sum_in,
       COALESCE(SUM(CASE WHEN (payload->>'amount')::numeric < 0 THEN ABS((payload->>'amount')::numeric) ELSE 0 END), 0)::text AS sum_out
     FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionIngested'
       AND metadata->>'source' = 'swigs-pro-bank'`,
    [tenantId],
  );

  const { rows: lastEvent } = await queryAsTenant<{ last_at: string | null }>(
    tenantId,
    `SELECT MAX(occurred_at) AS last_at FROM events
     WHERE tenant_id = $1
       AND (metadata->>'source' = 'swigs-pro' OR metadata->>'source' = 'swigs-pro-bank')`,
    [tenantId],
  );

  const byEvent: Record<string, { count: number; sum: number }> = {};
  for (const c of counts) {
    byEvent[c.event ?? "unknown"] = { count: Number(c.n), sum: Number(c.sum) };
  }

  const bankTxRow = bankCounts[0];

  return res.json({
    invoicesCreated: byEvent["invoice.created"]?.count ?? 0,
    invoicesPaid: byEvent["invoice.paid"]?.count ?? 0,
    invoicesUnpaid:
      (byEvent["invoice.created"]?.count ?? 0) - (byEvent["invoice.paid"]?.count ?? 0),
    caTotal: byEvent["invoice.created"]?.sum ?? 0,
    expensesCount: byEvent["expense.submitted"]?.count ?? 0,
    expensesTotal: byEvent["expense.submitted"]?.sum ?? 0,
    bankTransactionsCount: Number(bankTxRow?.n ?? 0),
    bankTransactionsIn: Number(bankTxRow?.sum_in ?? 0),
    bankTransactionsOut: Number(bankTxRow?.sum_out ?? 0),
    lastEventAt: lastEvent[0]?.last_at ?? null,
  });
});
