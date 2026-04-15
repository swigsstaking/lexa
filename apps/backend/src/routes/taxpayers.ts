import { Router } from "express";
import { z } from "zod";
import {
  TaxpayerDraftSubmitSchema,
  TaxpayerFieldUpdateSchema,
} from "../taxpayers/schema.js";
import {
  getOrCreateDraft,
  markSubmitted,
  resetDraft,
  updateField,
} from "../taxpayers/service.js";
import { query } from "../db/postgres.js";
import { buildVsPpDeclaration } from "../execution/VsPpFormBuilder.js";
import { renderVsPpPdf } from "../execution/VsPpPdfRenderer.js";
import { buildGePpDeclaration } from "../execution/GePpFormBuilder.js";
import { renderGePpPdf } from "../execution/GePpPdfRenderer.js";
import { buildVdPpDeclaration } from "../execution/VdPpFormBuilder.js";
import { renderVdPpPdf } from "../execution/VdPpPdfRenderer.js";
import {
  appendVsPpDeclarationEvent,
  findExistingVsPpDeclaration,
} from "../execution/idempotence.js";
import type { JwtPayload } from "../auth/jwt.js";

export const taxpayersRouter = Router();

// GET /taxpayers/profile — charge le profil persistant du tenant
taxpayersRouter.get("/profile", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM taxpayer_profiles WHERE tenant_id = $1",
      [req.tenantId],
    );
    res.json({ profile: result.rows[0] ?? null });
  } catch (err) {
    console.error("[taxpayers.profile.get]", err);
    res.status(500).json({ error: "profile fetch failed" });
  }
});

// PATCH /taxpayers/profile — upsert le profil (appelé auto à la fin du wizard)
taxpayersRouter.patch("/profile", async (req, res) => {
  const {
    firstName,
    lastName,
    birthDate,
    civilStatus,
    commune,
    canton,
    childrenCount,
  } = req.body as {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    civilStatus?: string;
    commune?: string;
    canton?: string;
    childrenCount?: number;
  };
  try {
    await query(
      `INSERT INTO taxpayer_profiles
         (tenant_id, first_name, last_name, birth_date, civil_status, commune, canton, children_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id) DO UPDATE SET
         first_name     = EXCLUDED.first_name,
         last_name      = EXCLUDED.last_name,
         birth_date     = EXCLUDED.birth_date,
         civil_status   = EXCLUDED.civil_status,
         commune        = EXCLUDED.commune,
         canton         = EXCLUDED.canton,
         children_count = EXCLUDED.children_count`,
      [req.tenantId, firstName, lastName, birthDate ?? null, civilStatus, commune, canton, childrenCount ?? 0],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[taxpayers.profile.patch]", err);
    res.status(500).json({ error: "profile upsert failed" });
  }
});

// GET /taxpayers/draft?year=2026 — retourne ou crée un draft pour le tenant
const getQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear()),
});

taxpayersRouter.get("/draft", async (req, res) => {
  const parse = getQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid query", details: parse.error.flatten() });
  }
  try {
    const draft = await getOrCreateDraft(req.tenantId, parse.data.year);

    // Merge le profil persistant dans step1 si le draft est vide sur ces champs
    const profileResult = await query(
      "SELECT * FROM taxpayer_profiles WHERE tenant_id = $1",
      [req.tenantId],
    );
    if (profileResult.rows[0]) {
      const prof = profileResult.rows[0] as {
        first_name?: string;
        last_name?: string;
        birth_date?: string;
        civil_status?: string;
        commune?: string;
        canton?: string;
        children_count?: number;
      };
      const VALID_CIVIL = ["single", "married", "divorced", "widowed", "registered_partnership", "separated"] as const;
      type CivilStatus = typeof VALID_CIVIL[number];
      const profileStep1 = {
        ...(prof.first_name && { firstName: prof.first_name }),
        ...(prof.last_name && { lastName: prof.last_name }),
        ...(prof.birth_date && { dateOfBirth: prof.birth_date.toString().slice(0, 10) }),
        ...(prof.civil_status && VALID_CIVIL.includes(prof.civil_status as CivilStatus) && {
          civilStatus: prof.civil_status as CivilStatus,
        }),
        ...(prof.commune && { commune: prof.commune }),
        ...(typeof prof.children_count === "number" && { childrenCount: prof.children_count }),
      };
      // draft wins si le champ est déjà rempli
      draft.state.step1 = { ...profileStep1, ...draft.state.step1 };
    }

    res.json({ draft });
  } catch (err) {
    console.error("[taxpayers.get]", err);
    res.status(500).json({ error: "draft fetch failed" });
  }
});

// PATCH /taxpayers/draft/field — mutation atomique
taxpayersRouter.patch("/draft/field", async (req, res) => {
  const parse = TaxpayerFieldUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  try {
    const user = req.user as JwtPayload;
    const draft = await updateField({
      tenantId: req.tenantId,
      userId: user.sub,
      fiscalYear: parse.data.fiscalYear,
      step: parse.data.step,
      field: parse.data.field,
      value: parse.data.value,
    });
    res.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[taxpayers.updateField]", err);
    res.status(400).json({ error: "field update failed", message });
  }
});

// POST /taxpayers/draft/submit — génère le PDF final à partir du draft
taxpayersRouter.post("/draft/submit", async (req, res) => {
  const parse = TaxpayerDraftSubmitSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { fiscalYear } = parse.data;

  try {
    const draft = await getOrCreateDraft(req.tenantId, fiscalYear);

    const form = await buildVsPpDeclaration({
      tenantId: req.tenantId,
      year: fiscalYear,
      draft: draft.state,
    });

    const existing = await findExistingVsPpDeclaration({
      tenantId: req.tenantId,
      formId: form.formId,
      version: form.version,
      year: fiscalYear,
    });

    const pdfBuffer = await renderVsPpPdf(form);

    let streamId: string;
    let eventId: number;
    let idempotent: boolean;
    if (existing) {
      streamId = existing.streamId;
      eventId = existing.eventId;
      idempotent = true;
    } else {
      const record = await appendVsPpDeclarationEvent(form);
      streamId = record.streamId;
      eventId = record.id;
      idempotent = false;
    }

    await markSubmitted(req.tenantId, fiscalYear);

    res.json({
      streamId,
      eventId,
      idempotent,
      form: {
        formId: form.formId,
        version: form.version,
        year: form.year,
        company: form.company,
        projection: form.projection,
        generatedAt: form.generatedAt,
      },
      pdf: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[taxpayers.submit]", err);
    res.status(500).json({ error: "submit failed", message });
  }
});

// POST /taxpayers/draft/reset — supprime le draft courant (dev / reprise)
const resetBodySchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2100),
});

taxpayersRouter.post("/draft/reset", async (req, res) => {
  const parse = resetBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body" });
  }
  try {
    await resetDraft(req.tenantId, parse.data.fiscalYear);
    res.json({ ok: true });
  } catch (err) {
    console.error("[taxpayers.reset]", err);
    res.status(500).json({ error: "reset failed" });
  }
});

// POST /taxpayers/draft/submit-ge — génère le PDF PP Genève à partir du draft
taxpayersRouter.post("/draft/submit-ge", async (req, res) => {
  const parse = TaxpayerDraftSubmitSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { fiscalYear } = parse.data;

  try {
    const draft = await getOrCreateDraft(req.tenantId, fiscalYear);

    const form = await buildGePpDeclaration({
      tenantId: req.tenantId,
      year: fiscalYear,
      draft: draft.state,
    });

    const existing = await findExistingVsPpDeclaration({
      tenantId: req.tenantId,
      formId: form.formId,
      version: form.version,
      year: fiscalYear,
    });

    const pdfBuffer = await renderGePpPdf(form);

    let streamId: string;
    let eventId: number;
    let idempotent: boolean;
    if (existing) {
      streamId = existing.streamId;
      eventId = existing.eventId;
      idempotent = true;
    } else {
      const record = await appendVsPpDeclarationEvent(form);
      streamId = record.streamId;
      eventId = record.id;
      idempotent = false;
    }

    await markSubmitted(req.tenantId, fiscalYear);

    res.json({
      streamId,
      eventId,
      idempotent,
      form: {
        formId: form.formId,
        version: form.version,
        year: form.year,
        company: form.company,
        projection: form.projection,
        generatedAt: form.generatedAt,
      },
      pdf: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[taxpayers.submit-ge]", err);
    res.status(500).json({ error: "submit-ge failed", message });
  }
});

// POST /taxpayers/draft/submit-vd — génère le PDF PP Vaud à partir du draft
taxpayersRouter.post("/draft/submit-vd", async (req, res) => {
  const parse = TaxpayerDraftSubmitSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { fiscalYear } = parse.data;

  try {
    const draft = await getOrCreateDraft(req.tenantId, fiscalYear);

    const form = await buildVdPpDeclaration({
      tenantId: req.tenantId,
      year: fiscalYear,
      draft: draft.state,
    });

    const existing = await findExistingVsPpDeclaration({
      tenantId: req.tenantId,
      formId: form.formId,
      version: form.version,
      year: fiscalYear,
    });

    const pdfBuffer = await renderVdPpPdf(form);

    let streamId: string;
    let eventId: number;
    let idempotent: boolean;
    if (existing) {
      streamId = existing.streamId;
      eventId = existing.eventId;
      idempotent = true;
    } else {
      const record = await appendVsPpDeclarationEvent(form);
      streamId = record.streamId;
      eventId = record.id;
      idempotent = false;
    }

    await markSubmitted(req.tenantId, fiscalYear);

    res.json({
      streamId,
      eventId,
      idempotent,
      form: {
        formId: form.formId,
        version: form.version,
        year: form.year,
        company: form.company,
        projection: form.projection,
        generatedAt: form.generatedAt,
      },
      pdf: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[taxpayers.submit-vd]", err);
    res.status(500).json({ error: "submit-vd failed", message });
  }
});
