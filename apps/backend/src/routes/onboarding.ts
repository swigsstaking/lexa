import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { searchCompany } from "../services/companyLookup.js";
import { query } from "../db/postgres.js";

export const onboardingRouter = Router();

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const LEGAL_FORM_ENUM = z.enum([
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
]);

const CANTON_ENUM = z.enum([
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU",
  "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
]);

/** GET /onboarding/company/search?q=xxx — search the Swiss UID register */
onboardingRouter.get("/company/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 3) {
    return res.json({ count: 0, results: [] });
  }
  try {
    const results = await searchCompany(q, 10);
    res.json({
      count: results.length,
      results,
      source: "uid-register",
    });
  } catch (err) {
    console.error("Company search error:", err);
    res.status(502).json({
      error: "company search failed",
      message: (err as Error).message,
      hint: "The Swiss UID register (BFS) may be temporarily unavailable. You can still create the company manually.",
    });
  }
});

const CompanyCreateSchema = z.object({
  tenantId: z.string().uuid().optional(),
  source: z.enum(["uid-register", "swigs-pro", "manual"]).default("manual"),
  uid: z.string().optional(),
  name: z.string().min(1).max(300),
  legalForm: LEGAL_FORM_ENUM.default("raison_individuelle"),
  legalFormLabel: z.string().optional(),
  street: z.string().max(500).optional(),
  zip: z.string().max(20).optional(),
  city: z.string().max(200).optional(),
  canton: CANTON_ENUM.optional(),
  country: z.string().length(2).default("CH"),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  iban: z.string().max(50).optional(),
  qrIban: z.string().max(50).optional(),
  isVatSubject: z.boolean().default(true),
  vatNumber: z.string().max(50).optional(),
  vatDeclarationFrequency: z.enum(["quarterly", "monthly", "annual"]).default("quarterly"),
  vatMethod: z.enum(["effective", "tdfn"]).default("effective"),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  employeeCount: z.number().int().min(0).default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** POST /onboarding/company — create a new company (manual or from UID register) */
onboardingRouter.post("/company", async (req, res) => {
  const parsed = CompanyCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const data = parsed.data;
  const tenantId = data.tenantId ?? randomUUID();

  try {
    const result = await query<{ id: string; tenant_id: string; created_at: Date }>(
      `INSERT INTO companies (
         tenant_id, uid, name, legal_form, legal_form_label,
         street, zip, city, canton, country,
         email, phone, iban, qr_iban,
         is_vat_subject, vat_number, vat_declaration_frequency, vat_method,
         fiscal_year_start_month, employee_count, source, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb)
       RETURNING id, tenant_id, created_at`,
      [
        tenantId,
        data.uid ?? null,
        data.name,
        data.legalForm,
        data.legalFormLabel ?? null,
        data.street ?? null,
        data.zip ?? null,
        data.city ?? null,
        data.canton ?? null,
        data.country,
        data.email ?? null,
        data.phone ?? null,
        data.iban ?? null,
        data.qrIban ?? null,
        data.isVatSubject,
        data.vatNumber ?? null,
        data.vatDeclarationFrequency,
        data.vatMethod,
        data.fiscalYearStartMonth,
        data.employeeCount,
        data.source,
        JSON.stringify(data.metadata ?? {}),
      ],
    );

    const createdAt = result.rows[0]!.created_at;
    res.status(201).json({
      company: {
        id: result.rows[0]!.id,
        tenantId: result.rows[0]!.tenant_id,
        ...data,
        createdAt,
        updatedAt: createdAt,
      },
    });
  } catch (err) {
    const pgErr = err as { code?: string; message: string };
    if (pgErr.code === "23505") {
      return res.status(409).json({ error: "company already exists for this tenant" });
    }
    console.error("Company create error:", err);
    res.status(500).json({ error: "create failed", message: pgErr.message });
  }
});

/** GET /onboarding/company/:tenantId — fetch a company */
onboardingRouter.get("/company/:tenantId", async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return res.status(400).json({ error: "invalid tenantId" });
  }

  const result = await query(
    `SELECT * FROM companies WHERE tenant_id = $1`,
    [tenantId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "company not found" });
  }

  res.json(result.rows[0]);
});

/** PATCH /onboarding/company/:tenantId — partial update */
onboardingRouter.patch("/company/:tenantId", async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return res.status(400).json({ error: "invalid tenantId" });
  }

  const updates = req.body as Record<string, unknown>;
  const allowedKeys = new Set([
    "name", "uid", "legal_form", "street", "zip", "city", "canton",
    "email", "phone", "iban", "qr_iban", "is_vat_subject", "vat_number",
    "vat_declaration_frequency", "vat_method", "fiscal_year_start_month",
    "employee_count",
  ]);

  const setClauses: string[] = [];
  const values: unknown[] = [tenantId];
  let idx = 2;
  for (const [key, val] of Object.entries(updates)) {
    const snake = key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
    if (!allowedKeys.has(snake)) continue;
    setClauses.push(`${snake} = $${idx}`);
    values.push(val);
    idx += 1;
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: "no valid fields to update" });
  }

  const result = await query(
    `UPDATE companies SET ${setClauses.join(", ")} WHERE tenant_id = $1 RETURNING *`,
    values,
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "company not found" });
  }

  res.json(result.rows[0]);
});
