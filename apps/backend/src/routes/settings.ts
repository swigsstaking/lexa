/**
 * Routes settings — Paramètres tenant (email forward, etc.)
 *
 * GET    /settings/email-forward              → config email forward (token, adresse, historique)
 * POST   /settings/email-forward/regenerate  → nouveau token
 * PATCH  /settings/email-forward/toggle      → activer/désactiver
 * GET    /settings/email-forward/history     → 20 derniers emails reçus
 *
 * Phase 1 V1.2 — email forward IMAP.
 */

import { Router } from "express";
import { randomBytes } from "node:crypto";
import { queryAsTenant } from "../db/postgres.js";

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
