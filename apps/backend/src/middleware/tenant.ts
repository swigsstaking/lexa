import type { Request, Response, NextFunction } from "express";

export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare module "express-serve-static-core" {
  interface Request {
    tenantId: string;
  }
}

/**
 * Extracts the active tenant from the incoming request.
 *
 * Priority: header `X-Tenant-Id` → query param `tenantId` → DEFAULT_TENANT_ID.
 *
 * The fallback to DEFAULT is intentional for the local dev / seed flow — it lets
 * curl-based tests keep working without mandatory headers. Session 11+ the
 * frontend always injects the active company id via the axios interceptor.
 */
export function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  const fromHeader = req.header("X-Tenant-Id") ?? req.header("x-tenant-id");
  const fromQuery = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const candidate = fromHeader ?? fromQuery;
  req.tenantId = candidate && UUID_RE.test(candidate) ? candidate : DEFAULT_TENANT_ID;
  next();
}
