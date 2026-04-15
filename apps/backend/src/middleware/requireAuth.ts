import type { NextFunction, Request, Response } from "express";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware JWT — lit `Authorization: Bearer <token>`, valide, injecte
 * `req.user` et override `req.tenantId` depuis le token. Renvoie 401 si
 * token absent, invalide ou expiré.
 *
 * Session 14 : v1 single-user / single-company. Le tenant vient du JWT,
 * le header `X-Tenant-Id` est ignoré quand un token est présent.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.header("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  const token = match[1]!;
  try {
    const payload = verifyToken(token);
    req.user = payload;
    req.tenantId = payload.tenantId;
    next();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "invalid or expired token";
    res.status(401).json({ error: "unauthorized", message });
  }
}
