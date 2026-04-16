/**
 * Routes fiduciaire — mode multi-clients
 * Session 32 — 2026-04-16
 *
 * GET  /fiduciary/clients         — list tenants accessibles au user courant
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

export const fiduciaryRouter = Router();

// ── GET /fiduciary/clients ─────────────────────────────────────────────────

fiduciaryRouter.get("/clients", requireAuth, async (req: Request, res: Response) => {
  const jwtUser = req.user as JwtPayload;
  try {
    const memberships = await listUserMemberships(jwtUser.sub);
    res.json({ clients: memberships });
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
