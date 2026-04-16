import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { query } from "../db/postgres.js";
import { config } from "../config/index.js";
import {
  comparePassword,
  hashPassword,
  signToken,
  type JwtPayload,
} from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listUserMemberships,
  validateMembership,
} from "../services/MembershipService.js";

export const authRouter = Router();

// ── Rate limit sur /auth/login (configurable via AUTH_RATE_LIMIT_MAX) ──
const loginLimiter = rateLimit({
  windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many login attempts, retry later" },
});

// ── Helpers ────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  verified: boolean;
  tenant_id: string;
  created_at: Date;
  last_login_at: Date | null;
};

type CompanyRow = {
  id: string;
  tenant_id: string;
  uid: string | null;
  name: string;
  legal_form: string;
  canton: string | null;
  country: string;
  is_vat_subject: boolean;
  vat_number: string | null;
  vat_declaration_frequency: string;
  vat_method: string;
  created_at: Date;
};

function userPublic(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    tenantId: row.tenant_id,
    verified: row.verified,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function companyPublic(row: CompanyRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    uid: row.uid,
    name: row.name,
    legalForm: row.legal_form,
    canton: row.canton,
    country: row.country,
    isVatSubject: row.is_vat_subject,
    vatNumber: row.vat_number,
    vatDeclarationFrequency: row.vat_declaration_frequency,
    vatMethod: row.vat_method,
    createdAt: row.created_at,
  };
}

// ── POST /auth/register ────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  company: z
    .object({
      name: z.string().min(1).max(300),
      legalForm: z
        .enum([
          "raison_individuelle",
          "societe_simple",
          "snc",
          "senc",
          "sa",
          "sca",
          "sarl",
          "cooperative",
          "fondation",
          "association",
          "sa_etrangere",
        ])
        .default("raison_individuelle"),
      uid: z.string().optional(),
      street: z.string().optional(),
      zip: z.string().optional(),
      city: z.string().optional(),
      canton: z
        .enum([
          "AG","AI","AR","BE","BL","BS","FR","GE","GL","GR","JU","LU",
          "NE","NW","OW","SG","SH","SO","SZ","TG","TI","UR","VD","VS","ZG","ZH",
        ])
        .optional(),
      isVatSubject: z.boolean().default(false),
      vatNumber: z.string().optional(),
    })
    .default({ name: "Mon entreprise", legalForm: "raison_individuelle" }),
});

authRouter.post("/register", async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parsed.error.flatten() });
  }
  const { email, password, company } = parsed.data;

  try {
    const existing = await query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "email already registered" });
    }

    const tenantId = randomUUID();
    const passwordHash = await hashPassword(password);

    // Transaction : créer company + user dans la même transaction
    const companyResult = await query<CompanyRow>(
      `INSERT INTO companies (
         tenant_id, name, legal_form, uid, street, zip, city, canton,
         country, is_vat_subject, vat_number, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CH', $9, $10, 'manual')
       RETURNING *`,
      [
        tenantId,
        company.name,
        company.legalForm,
        company.uid ?? null,
        company.street ?? null,
        company.zip ?? null,
        company.city ?? null,
        company.canton ?? null,
        company.isVatSubject,
        company.vatNumber ?? null,
      ],
    );

    const userResult = await query<UserRow>(
      `INSERT INTO users (email, password_hash, tenant_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email.toLowerCase(), passwordHash, tenantId],
    );
    const user = userResult.rows[0]!;

    const token = signToken({
      sub: user.id,
      tenantId: user.tenant_id,
      email: user.email,
    });

    res.status(201).json({
      user: userPublic(user),
      company: companyPublic(companyResult.rows[0]!),
      token,
    });
  } catch (err) {
    console.error("[auth.register]", err);
    res.status(500).json({
      error: "register failed",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});

// ── POST /auth/login ───────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

authRouter.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body" });
  }
  const { email, password } = parsed.data;

  try {
    const result = await query<UserRow>(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    await query(
      "UPDATE users SET last_login_at = NOW() WHERE id = $1",
      [user.id],
    );

    // S32 : charger les memberships pour le JWT étendu
    const memberships = await listUserMemberships(user.id);
    const membershipIds = memberships.map((m) => m.tenantId);
    // Priorité : tenant_id legacy (owner) ; fiduciaires sans tenant_id prennent le 1er membership
    const activeTenantId = user.tenant_id ?? membershipIds[0] ?? "";

    const token = signToken({
      sub: user.id,
      tenantId: activeTenantId, // legacy compat
      activeTenantId,
      memberships: membershipIds,
      email: user.email,
    });

    res.json({ user: userPublic(user), token });
  } catch (err) {
    console.error("[auth.login]", err);
    res.status(500).json({ error: "login failed" });
  }
});

// ── GET /auth/me (protégé) ─────────────────────────────────────────────

authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  const jwtUser = req.user as JwtPayload;
  try {
    const userResult = await query<UserRow>(
      "SELECT * FROM users WHERE id = $1",
      [jwtUser.sub],
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }
    const companyResult = await query<CompanyRow>(
      "SELECT * FROM companies WHERE tenant_id = $1",
      [user.tenant_id],
    );
    const company = companyResult.rows[0];
    res.json({
      user: userPublic(user),
      company: company ? companyPublic(company) : null,
    });
  } catch (err) {
    console.error("[auth.me]", err);
    res.status(500).json({ error: "me failed" });
  }
});

// ── POST /auth/admin/reset-password ────────────────────────────────────
// Filet de sécurité pour ne jamais bloquer un testeur. Le header
// X-Admin-Secret est un shared secret dev, pas une solution prod.

const AdminResetSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(8).max(200),
});

// ── POST /auth/switch-tenant (S32) ────────────────────────────────────────
// Permet à un fiduciaire de changer de tenant actif.
// Valide le membership, puis émet un nouveau JWT avec activeTenantId mis à jour.

const SwitchTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

authRouter.post("/switch-tenant", requireAuth, async (req: Request, res: Response) => {
  const jwtUser = req.user as JwtPayload;
  const parsed = SwitchTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "tenantId (uuid) required" });
  }
  const { tenantId } = parsed.data;

  try {
    const allowed = await validateMembership(jwtUser.sub, tenantId);
    if (!allowed) {
      return res.status(403).json({ error: "no membership for this tenant" });
    }

    // Re-charger les memberships pour avoir la liste à jour
    const memberships = await listUserMemberships(jwtUser.sub);
    const membershipIds = memberships.map((m) => m.tenantId);

    const token = signToken({
      sub: jwtUser.sub,
      tenantId,  // legacy compat
      activeTenantId: tenantId,
      memberships: membershipIds,
      email: jwtUser.email,
    });

    res.json({ token, activeTenantId: tenantId });
  } catch (err) {
    console.error("[auth.switch-tenant]", err);
    res.status(500).json({ error: "switch-tenant failed" });
  }
});

// ── POST /auth/admin/reset-password ────────────────────────────────────────
// Filet de sécurité pour ne jamais bloquer un testeur. Le header
// X-Admin-Secret est un shared secret dev, pas une solution prod.

authRouter.post(
  "/admin/reset-password",
  async (req: Request, res: Response) => {
    const headerSecret = req.header("X-Admin-Secret") ?? "";
    if (headerSecret !== config.ADMIN_SECRET) {
      return res.status(403).json({ error: "forbidden" });
    }
    const parsed = AdminResetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid body" });
    }
    const { email, newPassword } = parsed.data;
    try {
      const hash = await hashPassword(newPassword);
      const result = await query<{ id: string }>(
        "UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id",
        [hash, email.toLowerCase()],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "user not found" });
      }
      res.json({ ok: true, userId: result.rows[0]!.id });
    } catch (err) {
      console.error("[auth.admin.reset-password]", err);
      res.status(500).json({ error: "reset failed" });
    }
  },
);
