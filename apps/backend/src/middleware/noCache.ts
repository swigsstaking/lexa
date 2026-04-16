import type { Request, Response, NextFunction } from "express";

/**
 * noCache — Force les headers HTTP qui désactivent le cache sur les routes user-sensitive.
 *
 * Objectif : empêcher la fuite de session via 304 Not Modified — si un navigateur
 * met en cache GET /fiduciary/clients et qu'un autre user se connecte,
 * il verrait les clients du tenant précédent jusqu'au prochain fetch réseau.
 *
 * Fix BUG-P1-01 — Session 2026-04-16 Lane D vague 2.
 */
export function noCache(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}
