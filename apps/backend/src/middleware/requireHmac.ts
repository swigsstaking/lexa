import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index.js";

/**
 * Middleware HMAC pour les webhooks service-to-service depuis Swigs Pro.
 *
 * Attend un header `X-Lexa-Signature: sha256=<hex>` calculé côté Pro :
 *   sha256 = HMAC-SHA256(LEXA_WEBHOOK_SECRET, rawBody)
 *
 * Le secret vit dans `.env` des deux côtés (LEXA_WEBHOOK_SECRET). Comparaison
 * en timing-safe via crypto.timingSafeEqual pour éviter les attaques de
 * timing.
 *
 * Nécessite que `express.json({ verify: ... })` ait capturé `req.rawBody`
 * avant que ce middleware ne tourne (voir app.ts).
 */
export function requireHmac(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.header("X-Lexa-Signature") ?? "";
  const match = header.match(/^sha256=([a-f0-9]{64})$/i);
  if (!match) {
    res.status(401).json({ error: "missing or malformed X-Lexa-Signature" });
    return;
  }
  const provided = match[1]!.toLowerCase();

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(500).json({ error: "raw body not captured (verify hook missing)" });
    return;
  }

  const expected = createHmac("sha256", config.LEXA_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(provided, "utf-8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "invalid X-Lexa-Signature" });
    return;
  }

  next();
}
