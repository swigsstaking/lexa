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

type HubUserData = {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
};

/**
 * Trouve ou crée un user Lexa local à partir d'un user retourné par le Hub.
 * Mutualisé entre /auth/login, /auth/google et /auth/sso-verify.
 */
async function findOrCreateLocalUserFromHub(hubUser: HubUserData): Promise<UserRow> {
  const byHub = await query<UserRow>(
    "SELECT * FROM users WHERE external_sso_id = $1 OR email = $2 LIMIT 1",
    [hubUser.id, hubUser.email.toLowerCase()],
  );
  let user = byHub.rows[0];
  if (user) {
    await query(
      "UPDATE users SET external_sso_id = $1, last_login_at = NOW() WHERE id = $2",
      [hubUser.id, user.id],
    );
  } else {
    const tenantId = randomUUID();
    const companyName = hubUser.name || hubUser.email.split("@")[0] || "Mon entreprise";
    await query(
      `INSERT INTO companies (tenant_id, name, legal_form, country, source)
       VALUES ($1, $2, 'raison_individuelle', 'CH', 'hub-sso')`,
      [tenantId, companyName],
    );
    const inserted = await query<UserRow>(
      `INSERT INTO users (email, password_hash, tenant_id, external_sso_id, verified)
       VALUES ($1, '', $2, $3, true)
       RETURNING *`,
      [hubUser.email.toLowerCase(), tenantId, hubUser.id],
    );
    user = inserted.rows[0]!;
    await query(
      `INSERT INTO fiduciary_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [user.id, tenantId],
    );
  }
  return user!;
}

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
  const HUB_URL = process.env.HUB_URL;

  try {
    const existing = await query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "email already registered" });
    }

    let hubUserId: string | undefined;
    if (HUB_URL) {
      // Proxy register vers le Hub (pattern ai-builder)
      // Si l'user existe déjà sur le Hub avec ces credentials, on le récupère via login
      const hubName = company.name || email.split("@")[0] || "User";
      const hubReg = await fetch(`${HUB_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: hubName, password }),
      });
      const hubRegData = (await hubReg.json()) as { user?: { id: string }; error?: string };
      if (hubReg.ok && hubRegData.user?.id) {
        hubUserId = hubRegData.user.id;
      } else if (hubReg.status === 400 && hubRegData.error?.includes("already exists")) {
        // L'user existe déjà sur le Hub → le login pour récupérer son id
        const hubLogin = await fetch(`${HUB_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const hubLoginData = (await hubLogin.json()) as { user?: { id: string }; error?: string };
        if (!hubLogin.ok || !hubLoginData.user?.id) {
          return res.status(409).json({ error: "email exists on Hub but password incorrect" });
        }
        hubUserId = hubLoginData.user.id;
      } else {
        return res.status(hubReg.status).json({ error: hubRegData.error ?? "hub register failed" });
      }
    }

    const tenantId = randomUUID();
    const passwordHash = HUB_URL ? "" : await hashPassword(password);

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
      `INSERT INTO users (email, password_hash, tenant_id, external_sso_id, verified)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email.toLowerCase(), passwordHash, tenantId, hubUserId ?? null, !!hubUserId],
    );
    const user = userResult.rows[0]!;

    // Créer le membership 'owner' pour le user sur son propre tenant
    await query(
      `INSERT INTO fiduciary_memberships (user_id, tenant_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT DO NOTHING`,
      [user.id, tenantId],
    );

    const token = signToken({
      sub: user.id,
      tenantId: user.tenant_id,
      activeTenantId: user.tenant_id,
      memberships: [user.tenant_id],
      email: user.email,
      hubUserId,
    });

    res.status(201).json({
      user: userPublic(user),
      company: companyPublic(companyResult.rows[0]!),
      token,
      hubUserId: hubUserId ?? null,
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

// V1.1 SSO : login proxy via Swigs Hub (pattern ai-builder)
// Lexa n'a plus son propre store de password — l'auth est centralisée sur le Hub.
// Compat fallback : si HUB_URL absent, fallback à l'ancien login local password.
authRouter.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body" });
  }
  const { email, password } = parsed.data;
  const HUB_URL = process.env.HUB_URL;

  try {
    let hubUser: { id: string; email: string; name?: string; avatar?: string } | null = null;

    if (HUB_URL) {
      // Proxy auth vers le Hub
      const hubRes = await fetch(`${HUB_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      type HubUser = { id: string; email: string; name?: string; avatar?: string };
      const hubData = (await hubRes.json()) as { user?: HubUser; error?: string };
      if (!hubRes.ok) {
        return res.status(hubRes.status).json({ error: hubData.error ?? "invalid credentials" });
      }
      hubUser = hubData.user ?? null;
      if (!hubUser?.id) {
        return res.status(502).json({ error: "hub returned invalid user" });
      }
    }

    // Find or create local user (lié via external_sso_id si Hub utilisé)
    let user: UserRow | undefined;
    if (hubUser) {
      user = await findOrCreateLocalUserFromHub(hubUser);
    } else {
      // Fallback legacy : auth locale par password (si HUB_URL absent)
      const result = await query<UserRow>("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
      user = result.rows[0];
      if (!user) return res.status(401).json({ error: "invalid credentials" });
      const ok = await comparePassword(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: "invalid credentials" });
      await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    }

    if (!user) return res.status(500).json({ error: "user resolution failed" });

    const memberships = await listUserMemberships(user.id);
    const membershipIds = memberships.map((m) => m.tenantId);
    const activeTenantId = user.tenant_id ?? membershipIds[0] ?? "";

    const token = signToken({
      sub: user.id,
      tenantId: activeTenantId,
      activeTenantId,
      memberships: membershipIds,
      email: user.email,
      hubUserId: hubUser?.id,
    });

    res.json({ user: userPublic(user), token, hubUserId: hubUser?.id ?? null });
  } catch (err) {
    console.error("[auth.login]", err);
    res.status(500).json({ error: "login failed" });
  }
});

// ── POST /auth/google ────────────────────────────────────────────────────────
// Authentification via Google (idToken Google → Hub → findOrCreateLocalUser → JWT)

authRouter.post("/google", async (req: Request, res: Response) => {
  const { idToken } = (req.body ?? {}) as { idToken?: string };
  if (!idToken) return res.status(400).json({ error: "idToken required" });
  const HUB_URL = process.env.HUB_URL;
  if (!HUB_URL) return res.status(500).json({ error: "HUB_URL not configured" });

  try {
    const hubRes = await fetch(`${HUB_URL}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const hubData = await hubRes.json() as { user?: HubUserData; error?: string };
    if (!hubRes.ok) return res.status(hubRes.status).json({ error: hubData.error ?? "google auth failed" });
    if (!hubData.user?.id) return res.status(502).json({ error: "hub returned invalid user" });

    const user = await findOrCreateLocalUserFromHub(hubData.user);

    const memberships = await listUserMemberships(user.id);
    const membershipIds = memberships.map((m) => m.tenantId);
    const activeTenantId = user.tenant_id ?? membershipIds[0] ?? "";

    const token = signToken({
      sub: user.id,
      tenantId: activeTenantId,
      activeTenantId,
      memberships: membershipIds,
      email: user.email,
      hubUserId: hubData.user.id,
    });

    return res.json({ user: userPublic(user), token, hubUserId: hubData.user.id });
  } catch (err) {
    console.error("[auth.google]", err);
    return res.status(500).json({ error: "google auth failed" });
  }
});

// ── POST /auth/magic-link ─────────────────────────────────────────────────────
// Demande d'un magic-link email via le Hub (anti-énumération : réponse silencieuse)

authRouter.post("/magic-link", async (req: Request, res: Response) => {
  const { email } = (req.body ?? {}) as { email?: string };
  if (!email) return res.status(400).json({ error: "email required" });
  const HUB_URL = process.env.HUB_URL;
  const APP_ID = process.env.LEXA_HUB_APP_ID ?? "lexa";
  const ORIGIN = process.env.LEXA_PUBLIC_URL ?? "https://lexa.swigs.online";
  if (!HUB_URL) return res.status(500).json({ error: "HUB_URL not configured" });

  try {
    const hubRes = await fetch(`${HUB_URL}/api/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, app: APP_ID, redirect: `${ORIGIN}/sso-callback` }),
    });
    const hubData = await hubRes.json() as { error?: string };
    if (!hubRes.ok) return res.status(hubRes.status).json({ error: hubData.error ?? "magic link failed" });
    // Silent success même si compte inexistant (anti-énumération email)
    return res.json({ message: "Si un compte existe, un email vous a été envoyé." });
  } catch (err) {
    console.error("[auth.magic-link]", err);
    return res.status(500).json({ error: "magic link failed" });
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
    // Utiliser activeTenantId du JWT (set après switch-tenant) plutôt que le
    // tenant original du user — permet au badge de se mettre à jour après switch.
    const activeTenantId = jwtUser.activeTenantId ?? user.tenant_id;
    const companyResult = await query<CompanyRow>(
      "SELECT * FROM companies WHERE tenant_id = $1",
      [activeTenantId],
    );
    const company = companyResult.rows[0];
    // V1.1 SSO : exposer hubUserId depuis le JWT si présent
    res.json({
      user: userPublic(user),
      company: company ? companyPublic(company) : null,
      hubUserId: jwtUser.hubUserId ?? null,
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

// ── GET /api/auth/memberships ──────────────────────────────────────────────
// Retourne TOUS les memberships du user authentifié (owner + fiduciary + viewer).
// Utilisé par le dropdown switcher frontend pour lister tous les comptes.

authRouter.get("/memberships", requireAuth, async (req: Request, res: Response) => {
  const jwtUser = req.user as JwtPayload;
  try {
    const memberships = await listUserMemberships(jwtUser.sub);
    res.json({ memberships });
  } catch (err) {
    console.error("[auth.memberships]", err);
    res.status(500).json({ error: "memberships failed" });
  }
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

// ── POST /auth/sso-verify (V1.1 SSO Swigs Hub) ────────────────────────────────
// Accepte un ssoToken émis par apps.swigs.online, le vérifie auprès du Hub,
// puis crée ou retrouve le user Lexa correspondant et émet un JWT avec hubUserId.
// Compatible dual-mode : l'auth email/password existante reste disponible.

const ssoVerifyLimiter = rateLimit({
  windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many SSO attempts, retry later" },
});

const SsoVerifySchema = z.object({
  ssoToken: z.string().min(1),
});

authRouter.post("/sso-verify", ssoVerifyLimiter, async (req: Request, res: Response) => {
  const parsed = SsoVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "ssoToken required" });
  }
  const { ssoToken } = parsed.data;

  if (!config.APP_SECRET) {
    console.error("[auth.sso-verify] APP_SECRET not configured");
    return res.status(500).json({ error: "SSO not configured on this server" });
  }

  // 1. Vérifier le token auprès du Swigs Hub
  let hubUser: { hubId?: string; id?: string; email: string; name?: string };
  try {
    const verifyRes = await fetch(`${config.HUB_URL}/api/auth/sso-verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Secret": config.APP_SECRET,
      },
      body: JSON.stringify({
        ssoToken,
        appId: config.LEXA_HUB_APP_ID,
      }),
    });

    if (!verifyRes.ok) {
      const errBody = await verifyRes.json().catch(() => ({})) as { error?: string };
      console.warn("[auth.sso-verify] Hub rejected token:", errBody);
      return res.status(401).json({
        error: errBody.error ?? "invalid_sso_token",
        code: "SSO_VERIFY_FAILED",
      });
    }

    const body = await verifyRes.json() as { user: typeof hubUser };
    hubUser = body.user;
  } catch (err) {
    console.error("[auth.sso-verify] Hub unreachable:", err);
    return res.status(502).json({ error: "hub_unreachable" });
  }

  // 2. Résoudre le hubId (le Hub retourne hubId ou id selon la version)
  const hubId = hubUser.hubId ?? hubUser.id;
  if (!hubId) {
    return res.status(502).json({ error: "hub_returned_no_user_id" });
  }

  try {
    // 3. Trouver ou créer le user local via le helper mutualisé
    const user = await findOrCreateLocalUserFromHub({
      id: hubId,
      email: hubUser.email,
      name: hubUser.name,
    });

    // 5. Charger les memberships pour le JWT étendu
    const memberships = await listUserMemberships(user.id);
    const membershipIds = memberships.map((m) => m.tenantId);
    const activeTenantId = user.tenant_id ?? membershipIds[0] ?? "";

    // 6. Émettre le JWT avec claim hubUserId
    const token = signToken({
      sub: user.id,
      tenantId: activeTenantId,
      activeTenantId,
      memberships: membershipIds,
      email: user.email,
      hubUserId: hubId,
    });

    // 7. Retourner token + user + hubUserId
    return res.json({
      token,
      hubUserId: hubId,
      user: userPublic(user),
    });
  } catch (err) {
    console.error("[auth.sso-verify]", err);
    return res.status(500).json({ error: "sso_verify_failed" });
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
