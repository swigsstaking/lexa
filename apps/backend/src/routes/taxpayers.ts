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
import { buildVsPpDeclaration } from "../execution/VsPpFormBuilder.js";
import { renderVsPpPdf } from "../execution/VsPpPdfRenderer.js";
import {
  appendVsPpDeclarationEvent,
  findExistingVsPpDeclaration,
} from "../execution/idempotence.js";
import type { JwtPayload } from "../auth/jwt.js";

export const taxpayersRouter = Router();

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
