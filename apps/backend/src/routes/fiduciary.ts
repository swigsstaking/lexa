/**
 * Routes fiduciaire — mode multi-clients
 * Session 32 — 2026-04-16
 *
 * GET  /fiduciary/clients         — list tenants accessibles au user courant
 * GET  /fiduciary/portfolio       — vue consolidée cross-tenants avec KPIs
 * POST /fiduciary/invite          — grant membership (owner-only)
 * POST /auth/switch-tenant        — valide membership + issue nouveau JWT (dans authRouter)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { query } from "../db/postgres.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listUserMemberships,
  grantMembership,
} from "../services/MembershipService.js";
import type { JwtPayload } from "../auth/jwt.js";

// ── Types portfolio ────────────────────────────────────────────────────────

export type LedgerHealth = {
  balanced: boolean;
  txCount: number;
  totalDebit: number;
};

export type Deadline = {
  label: string;
  dueDate: string;
  daysLeft: number;
};

export type PortfolioClient = {
  tenantId: string;
  name: string;
  legalForm: string;
  canton: string | null;
  lastActivity: string | null;
  ledgerHealth: LedgerHealth;
  nextDeadline: Deadline | null;
  alerts: string[];
};

export const fiduciaryRouter = Router();

// ── GET /fiduciary/portfolio ───────────────────────────────────────────────
// Vue consolidée cross-tenants : KPIs ledger + prochaine échéance fiscale.
// Nécessite au moins 1 membership ; retourne 403 si aucun.

fiduciaryRouter.get("/portfolio", requireAuth, async (req: Request, res: Response) => {
  const jwtUser = req.user as JwtPayload;
  try {
    const memberships = await listUserMemberships(jwtUser.sub);
    if (memberships.length === 0) {
      return res.status(403).json({ error: "no fiduciary memberships" });
    }

    const tenantIds = memberships.map((m) => m.tenantId);

    // Données company (nom, forme juridique, canton, dernière activité)
    const placeholders = tenantIds.map((_, i) => `$${i + 1}`).join(", ");
    const companiesRes = await query<{
      tenant_id: string;
      name: string;
      legal_form: string;
      canton: string | null;
    }>(
      `SELECT tenant_id, name, legal_form, canton FROM companies WHERE tenant_id IN (${placeholders})`,
      tenantIds,
    );
    const companyMap = new Map(companiesRes.rows.map((r) => [r.tenant_id, r]));

    // Santé ledger : agrégé par tenant sur ledger_entries (vue matérialisée)
    const ledgerRes = await query<{
      tenant_id: string;
      tx_count: string;
      total_debit: string;
      total_credit: string;
      last_date: string | null;
    }>(
      `SELECT
         tenant_id,
         COUNT(DISTINCT stream_id)::text              AS tx_count,
         COALESCE(SUM(CASE WHEN line_type = 'debit' THEN amount ELSE 0 END), 0)::text  AS total_debit,
         COALESCE(SUM(CASE WHEN line_type = 'credit' THEN amount ELSE 0 END), 0)::text AS total_credit,
         MAX(transaction_date)::text                  AS last_date
       FROM ledger_entries
       WHERE tenant_id IN (${placeholders})
       GROUP BY tenant_id`,
      tenantIds,
    );
    const ledgerMap = new Map(ledgerRes.rows.map((r) => [r.tenant_id, r]));

    // Échéances fiscales suisses standard : TVA trimestrielle Q1 = 30 avril
    // Calcul dynamique à partir de la date courante.
    const today = new Date();
    const year = today.getFullYear();

    const DEADLINES: Array<{ label: string; month: number; day: number }> = [
      { label: "Déclaration TVA Q1", month: 4, day: 30 },
      { label: "Déclaration TVA Q2", month: 7, day: 31 },
      { label: "Déclaration TVA Q3", month: 10, day: 31 },
      { label: "Déclaration TVA Q4", month: 1, day: 31 },
      { label: "Déclaration PM annuelle", month: 9, day: 30 },
    ];

    function nextDeadline(): Deadline | null {
      const upcoming = DEADLINES
        .map((d) => {
          const fiscalYear = d.month === 1 ? year + 1 : year;
          const due = new Date(fiscalYear, d.month - 1, d.day);
          const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
          return { label: d.label, dueDate: due.toISOString().slice(0, 10), daysLeft };
        })
        .filter((d) => d.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      return upcoming[0] ?? null;
    }

    const sharedDeadline = nextDeadline();

    const clients: PortfolioClient[] = tenantIds.map((tenantId) => {
      const company = companyMap.get(tenantId);
      const ledger = ledgerMap.get(tenantId);
      const txCount = ledger ? parseInt(ledger.tx_count, 10) : 0;
      const totalDebit = ledger ? parseFloat(ledger.total_debit) : 0;
      const totalCredit = ledger ? parseFloat(ledger.total_credit) : 0;
      // Équilibré si delta < 0.01 CHF (tolérance arrondi)
      const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
      const alerts: string[] = [];
      if (!balanced && txCount > 0) alerts.push("Ledger déséquilibré");

      return {
        tenantId,
        name: company?.name ?? memberships.find((m) => m.tenantId === tenantId)?.tenantName ?? tenantId.slice(0, 8),
        legalForm: company?.legal_form ?? "unknown",
        canton: company?.canton ?? null,
        lastActivity: ledger?.last_date ?? null,
        ledgerHealth: { balanced, txCount, totalDebit },
        nextDeadline: sharedDeadline,
        alerts,
      };
    });

    res.json({ clients });
  } catch (err) {
    console.error("[fiduciary.portfolio]", err);
    res.status(500).json({ error: "failed to build portfolio" });
  }
});

// ── GET /fiduciary/clients ─────────────────────────────────────────────────

fiduciaryRouter.get("/clients", requireAuth, async (req: Request, res: Response) => {
  const jwtUser = req.user as JwtPayload;
  try {
    const memberships = await listUserMemberships(jwtUser.sub);
    const fiduClients = memberships.filter((m) => m.role === "fiduciary");
    res.json({ clients: fiduClients });
  } catch (err) {
    console.error("[fiduciary.clients]", err);
    res.status(500).json({ error: "failed to list clients" });
  }
});

// ── POST /fiduciary/invite ─────────────────────────────────────────────────

const InviteSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email().max(320),
  role: z.enum(["fiduciary", "viewer"]).default("fiduciary"),
});

fiduciaryRouter.post("/invite", requireAuth, async (req: Request, res: Response) => {
  const jwtUser = req.user as JwtPayload;
  const parsed = InviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  const { tenantId, email, role } = parsed.data;

  try {
    // Vérifie que le user courant est owner du tenant ciblé
    const ownership = await query(
      `SELECT role FROM fiduciary_memberships WHERE user_id = $1 AND tenant_id = $2 AND role = 'owner'`,
      [jwtUser.sub, tenantId],
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "must be owner to invite" });
    }

    // Trouve le user cible
    const invited = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    if (invited.rows.length === 0) {
      return res.status(404).json({ error: "user not found" });
    }

    await grantMembership(invited.rows[0]!.id, tenantId, role);
    res.json({ ok: true, userId: invited.rows[0]!.id, tenantId, role });
  } catch (err) {
    console.error("[fiduciary.invite]", err);
    res.status(500).json({ error: "invite failed" });
  }
});
