/**
 * Routes Conseiller — Briefings quotidiens
 *
 * GET  /conseiller/briefings          — liste les briefings récents (max 30)
 * PATCH /conseiller/briefings/:id/read — marque un briefing comme lu
 * POST /conseiller/briefings/generate-now — déclenche génération manuelle
 *
 * Session: briefing-quotidien (avril 2026)
 */

import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { queryAsTenant } from "../db/postgres.js";
import { generateBriefingForTenant } from "../services/BriefingScheduler.js";

export const conseillerRouter = Router();

/** GET /conseiller/briefings — liste des briefings récents pour le tenant actif */
conseillerRouter.get("/briefings", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 7), 30);

    const { rows } = await queryAsTenant(
      req.tenantId,
      `SELECT id, date_for, markdown, content, read_at, generated_at
       FROM briefings
       WHERE tenant_id = $1
       ORDER BY date_for DESC
       LIMIT $2`,
      [req.tenantId, limit],
    );

    res.json({ briefings: rows });
  } catch (err) {
    console.error("[conseiller] GET /briefings error:", err);
    res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});

/** PATCH /conseiller/briefings/:id/read — marquer un briefing comme lu */
conseillerRouter.patch("/briefings/:id/read", requireAuth, async (req, res) => {
  try {
    await queryAsTenant(
      req.tenantId,
      `UPDATE briefings
       SET read_at = now()
       WHERE id = $1 AND tenant_id = $2 AND read_at IS NULL`,
      [req.params.id, req.tenantId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[conseiller] PATCH /briefings/:id/read error:", err);
    res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});

/** POST /conseiller/briefings/generate-now — déclenche génération immédiate (dev/démo) */
conseillerRouter.post("/briefings/generate-now", requireAuth, async (req, res) => {
  try {
    const year = Number(req.body?.year ?? new Date().getFullYear());

    // Génération asynchrone — on répond 202 immédiatement, la génération continue en background
    generateBriefingForTenant(req.tenantId, year).catch((err) => {
      console.error(`[conseiller] Background generation failed for tenant ${req.tenantId}:`, err.message);
    });

    res.status(202).json({ ok: true, message: "Briefing en cours de génération (~15-30s)" });
  } catch (err) {
    console.error("[conseiller] POST /briefings/generate-now error:", err);
    res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});
