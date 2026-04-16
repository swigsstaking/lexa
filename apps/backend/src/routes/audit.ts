/**
 * Routes Audit — Vérification citations + Audit trail (session 30)
 *
 * POST /audit/verify-citations — vérifie une liste de citations légales via Qdrant
 * GET  /audit/trail/:year     — retourne l'audit trail structuré pour une année
 */

import { Router } from "express";
import { z } from "zod";
import { verifyCitations } from "../services/CitationVerifier.js";
import { buildAuditTrail } from "../services/AuditTrail.js";

export const auditRouter = Router();

// ── POST /audit/verify-citations ─────────────────────────────────────────────

const verifyCitationsSchema = z.object({
  citations: z
    .array(
      z.object({
        law: z.string().min(1).max(20),
        article: z.string().min(1).max(20),
        rs: z.string().optional(),
      }),
    )
    .min(1)
    .max(20),
});

auditRouter.post("/verify-citations", async (req, res) => {
  const parse = verifyCitationsSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }

  const started = Date.now();

  try {
    const results = await verifyCitations(parse.data.citations);
    return res.json({
      results,
      stats: {
        total: results.length,
        verified: results.filter((r) => r.verified).length,
        unverified: results.filter((r) => !r.verified).length,
      },
      durationMs: Date.now() - started,
      legalBasis: "CO art. 958f (RS 220) — intégrité des références légales dans l'audit trail",
    });
  } catch (err) {
    console.error("[audit.verify-citations]", err);
    return res.status(500).json({
      error: "verification failed",
      message: (err as Error).message,
    });
  }
});

// ── GET /audit/trail/:year ────────────────────────────────────────────────────

const yearParamSchema = z.coerce.number().int().min(2020).max(2100);

auditRouter.get("/trail/:year", async (req, res) => {
  const yearParse = yearParamSchema.safeParse(req.params.year);
  if (!yearParse.success) {
    return res.status(400).json({ error: "invalid year param" });
  }

  try {
    const trail = await buildAuditTrail(req.tenantId, yearParse.data);
    return res.json(trail);
  } catch (err) {
    console.error("[audit.trail]", err);
    return res.status(500).json({
      error: "trail build failed",
      message: (err as Error).message,
    });
  }
});
