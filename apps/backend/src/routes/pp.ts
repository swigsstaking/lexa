import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { queryAsTenant } from "../db/postgres.js";
import { saveUploadedFile, isAcceptedMimeType } from "../services/storage/uploads.js";
import { ocrQueue } from "../jobs/ocrProcess.js";
import type { ImportCategory } from "../services/ocr/prompts.js";

export const ppRouter = Router();

type Tone = "pos" | "neg" | "tax" | "asset";

interface PpItem {
  code: string;
  name: string;
  amount: number;
  count: number;
  tone: Tone;
}

interface PpBucket {
  k: string;
  items: PpItem[];
}

const yearQuerySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2020)
    .max(2100)
    .default(new Date().getFullYear()),
});

// GET /pp/summary?year=2026
ppRouter.get("/summary", async (req, res) => {
  const parse = yearQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid query", details: parse.error.flatten() });
  }

  const { year } = parse.data;
  const tenantId = req.tenantId;

  try {
    const [incomeRes, expenseRes, savingsRes, draftRes] = await Promise.all([
      queryAsTenant<{ category_code: string; label: string; amount: string; count: number }>(
        tenantId,
        `SELECT category_code, label, amount::text, count
         FROM pp_income_entries
         WHERE tenant_id = $1 AND fiscal_year = $2
         ORDER BY category_code`,
        [tenantId, year],
      ),
      queryAsTenant<{ category_code: string; label: string; amount: string; count: number }>(
        tenantId,
        `SELECT category_code, label, amount::text, count
         FROM pp_expense_entries
         WHERE tenant_id = $1 AND fiscal_year = $2
         ORDER BY category_code`,
        [tenantId, year],
      ),
      queryAsTenant<{ category_code: string; label: string; amount: string; count: number }>(
        tenantId,
        `SELECT category_code, label, amount::text, count
         FROM pp_savings_entries
         WHERE tenant_id = $1 AND fiscal_year = $2
         ORDER BY category_code`,
        [tenantId, year],
      ),
      queryAsTenant<{ state: { step4?: { pilier3a?: number; rachatsLpp?: number } } }>(
        tenantId,
        `SELECT state FROM taxpayer_drafts WHERE tenant_id = $1 AND fiscal_year = $2 LIMIT 1`,
        [tenantId, year],
      ),
    ]);

    const buckets: PpBucket[] = [];

    if (incomeRes.rows.length > 0) {
      buckets.push({
        k: "Salaire & revenus",
        items: incomeRes.rows.map((r) => ({
          code: r.category_code,
          name: r.label,
          amount: parseFloat(r.amount),
          count: r.count,
          tone: "pos" as Tone,
        })),
      });
    }

    if (expenseRes.rows.length > 0) {
      buckets.push({
        k: "Vie privée",
        items: expenseRes.rows.map((r) => ({
          code: r.category_code,
          name: r.label,
          amount: parseFloat(r.amount),
          count: r.count,
          tone: "neg" as Tone,
        })),
      });
    }

    if (savingsRes.rows.length > 0) {
      buckets.push({
        k: "Épargne & prévoyance",
        items: savingsRes.rows.map((r) => ({
          code: r.category_code,
          name: r.label,
          amount: parseFloat(r.amount),
          count: r.count,
          tone: "asset" as Tone,
        })),
      });
    }

    // Bucket "Obligations fiscales" calculé depuis taxpayer_drafts si disponible
    const draft = draftRes.rows[0];
    if (draft) {
      const s4 = draft.state?.step4 ?? {};
      const taxItems: PpItem[] = [];

      // Estimation simplifiée d'après les déductions connues.
      // Les montants exacts proviennent du wizard (submit-vs/ge/vd/fr).
      // On expose des placeholders calculés pour affichage workspace uniquement.
      const pilier3a = s4.pilier3a ?? 0;
      const rachatsLpp = s4.rachatsLpp ?? 0;

      if (pilier3a > 0 || rachatsLpp > 0) {
        const totalDeductions = pilier3a + rachatsLpp;
        taxItems.push({
          code: "O01",
          name: "Estimation impôts (après déductions)",
          amount: Math.round(totalDeductions * 0.3),
          count: 1,
          tone: "tax",
        });
      }

      if (taxItems.length > 0) {
        buckets.push({ k: "Obligations fiscales", items: taxItems });
      }
    }

    return res.json({ buckets, fiscalYear: year });
  } catch (err) {
    console.error("[pp.summary]", err);
    return res.status(500).json({ error: "pp summary failed" });
  }
});

// ===== IMPORT (P1.B.B1) =====

// ── Multer : upload multipart, max 10 MB, PDF/JPEG/PNG uniquement ─────────────
const ACCEPTED_UPLOAD_MIMETYPES = ["application/pdf", "image/jpeg", "image/png"];

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_UPLOAD_MIMETYPES.includes(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    } else {
      cb(null, true);
    }
  },
});

// ── Rate limit : 10 uploads/min/user ─────────────────────────────────────────
const importUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.sub ?? req.tenantId ?? "unknown",
  message: { error: "rate_limit", message: "Too many uploads — max 10 per minute" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Schémas Zod ───────────────────────────────────────────────────────────────
const VALID_CATEGORIES = ["auto", "salary", "wealth", "investment", "expense", "insurance"] as const;
type UploadCategory = (typeof VALID_CATEGORIES)[number];

const uploadBodySchema = z.object({
  category: z.enum(VALID_CATEGORIES).default("auto"),
  meta: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return {};
      try {
        return JSON.parse(v) as Record<string, unknown>;
      } catch {
        return {};
      }
    }),
});

const listQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : [])),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const validateBodySchema = z.object({
  validated_data: z.record(z.unknown()),
});

// ── POST /pp/import/upload ────────────────────────────────────────────────────
ppRouter.post(
  "/import/upload",
  importUploadLimiter,
  uploadMiddleware.single("file"),
  async (req, res) => {
    // Multer fileFilter error (mauvais MIME type) → 415
    // Note: multer errors arrivant ici via next(err) → géré par le error handler global
    // Mais multer peut aussi rejeter silencieusement — on vérifie req.file
    if (!req.file) {
      return res.status(400).json({ error: "missing_file", message: "No file uploaded or file type unsupported (PDF, JPEG, PNG max 10MB)" });
    }

    const mimeType = req.file.mimetype;
    if (!isAcceptedMimeType(mimeType)) {
      return res.status(415).json({ error: "unsupported_media_type", message: `Accepted types: ${ACCEPTED_UPLOAD_MIMETYPES.join(", ")}` });
    }

    const parse = uploadBodySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "invalid_params", details: parse.error.flatten() });
    }

    const { category, meta } = parse.data;
    const tenantId = req.tenantId;
    const userId = req.user?.sub ?? "unknown";
    const importId = randomUUID();

    try {
      // Sauvegarder le fichier sur disque
      const filePath = await saveUploadedFile(tenantId, importId, mimeType, req.file.buffer);

      // Insérer l'import en DB
      await queryAsTenant(
        tenantId,
        `INSERT INTO pp_imports
          (id, tenant_id, user_id, category, source_type, source_url, source_meta, status)
         VALUES ($1, $2, $3, $4, 'upload', $5, $6, 'pending')`,
        [importId, tenantId, userId, category, filePath, JSON.stringify(meta)],
      );

      // Enqueue le job OCR
      await ocrQueue.add("ocr.process", {
        importId,
        tenantId,
        filePath,
        mimeType,
        category: category as ImportCategory | "auto",
      });

      return res.status(202).json({
        id: importId,
        status: "pending",
        category,
        estimated_seconds: 15,
      });
    } catch (err) {
      console.error("[pp.import.upload]", err);
      return res.status(500).json({ error: "upload_failed", message: (err as Error).message });
    }
  },
);

// ── GET /pp/import/:id ────────────────────────────────────────────────────────
ppRouter.get("/import/:id", async (req, res) => {
  const importId = req.params["id"] as string;
  const tenantId = req.tenantId;

  try {
    const result = await queryAsTenant<{
      id: string;
      status: string;
      category: string;
      confidence: string | null;
      raw_extraction: Record<string, unknown> | null;
      validated_data: Record<string, unknown> | null;
      error_message: string | null;
      wizard_step_target: string | null;
      source_type: string;
      source_url: string | null;
      created_at: string;
      updated_at: string;
    }>(
      tenantId,
      `SELECT id, status, category, confidence, raw_extraction, validated_data,
              error_message, wizard_step_target, source_type, source_url, created_at, updated_at
       FROM pp_imports
       WHERE id=$1 AND tenant_id=$2`,
      [importId, tenantId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    const row = result.rows[0]!;
    return res.json({
      ...row,
      confidence: row.confidence !== null ? parseFloat(row.confidence) : null,
    });
  } catch (err) {
    console.error("[pp.import.get]", err);
    return res.status(500).json({ error: "fetch_failed" });
  }
});

// ── GET /pp/import ────────────────────────────────────────────────────────────
ppRouter.get("/import", async (req, res) => {
  const tenantId = req.tenantId;

  const parse = listQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_params", details: parse.error.flatten() });
  }

  const { status: statusFilter, limit } = parse.data;

  try {
    let sql: string;
    let params: unknown[];

    if (statusFilter.length > 0) {
      // Génère des placeholders dynamiques : $2, $3, ...
      const placeholders = statusFilter.map((_, i) => `$${i + 2}`).join(", ");
      sql = `SELECT id, status, category, confidence, wizard_step_target, error_message, created_at, updated_at
             FROM pp_imports
             WHERE tenant_id=$1 AND status IN (${placeholders})
             ORDER BY created_at DESC
             LIMIT $${statusFilter.length + 2}`;
      params = [tenantId, ...statusFilter, limit];
    } else {
      sql = `SELECT id, status, category, confidence, wizard_step_target, error_message, created_at, updated_at
             FROM pp_imports
             WHERE tenant_id=$1
             ORDER BY created_at DESC
             LIMIT $2`;
      params = [tenantId, limit];
    }

    const result = await queryAsTenant<{
      id: string;
      status: string;
      category: string;
      confidence: string | null;
      wizard_step_target: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    }>(tenantId, sql, params);

    return res.json({
      items: result.rows.map((r) => ({
        ...r,
        confidence: r.confidence !== null ? parseFloat(r.confidence) : null,
      })),
      total: result.rows.length,
    });
  } catch (err) {
    console.error("[pp.import.list]", err);
    return res.status(500).json({ error: "list_failed" });
  }
});

// ── POST /pp/import/:id/validate ──────────────────────────────────────────────
ppRouter.post("/import/:id/validate", async (req, res) => {
  const importId = req.params["id"] as string;
  const tenantId = req.tenantId;

  const parse = validateBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_params", details: parse.error.flatten() });
  }

  const { validated_data } = parse.data;

  try {
    // Vérifier que l'import existe et appartient au tenant
    const check = await queryAsTenant<{ status: string }>(
      tenantId,
      `SELECT status FROM pp_imports WHERE id=$1 AND tenant_id=$2`,
      [importId, tenantId],
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    const currentStatus = check.rows[0]!.status;
    if (!["extracted", "validated"].includes(currentStatus)) {
      return res.status(409).json({
        error: "invalid_status",
        message: `Import must be in 'extracted' state to validate. Current: ${currentStatus}`,
      });
    }

    await queryAsTenant(
      tenantId,
      `UPDATE pp_imports
       SET status='committed', validated_data=$2, updated_at=now()
       WHERE id=$1 AND tenant_id=$3`,
      [importId, JSON.stringify(validated_data), tenantId],
    );

    return res.json({
      id: importId,
      status: "committed",
      wizard_state_updated: true,
    });
  } catch (err) {
    console.error("[pp.import.validate]", err);
    return res.status(500).json({ error: "validate_failed" });
  }
});
