import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config/index.js";

export type JwtPayload = {
  sub: string; // userId
  tenantId: string; // legacy — alias de activeTenantId pour compatibilité
  activeTenantId?: string; // S32 : tenant actif (peut être changé via switch-tenant)
  memberships?: string[]; // S32 : liste des tenant_ids accessibles au user
  email: string;
  hubUserId?: string; // V1.1 SSO : lien cryptographique au Swigs Hub (apps.swigs.online)
};

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function comparePassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  const opts: SignOptions = {
    algorithm: "HS256",
    expiresIn: config.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, config.JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JwtPayload;
  if (!decoded.sub || !decoded.email) {
    throw new Error("invalid jwt payload");
  }
  // Tolère les JWT legacy (sans activeTenantId) — tenantId reste valide
  if (!decoded.tenantId && !decoded.activeTenantId) {
    throw new Error("invalid jwt payload: missing tenantId");
  }
  return decoded;
}
