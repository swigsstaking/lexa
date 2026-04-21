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
import { generateEch0119PpXml } from "../services/Ech0119Generator.js";
import { query, queryAsTenant } from "../db/postgres.js";
import { getDb } from "../db/mongo.js";
import { buildVsPpDeclaration } from "../execution/VsPpFormBuilder.js";
import { renderVsPpPdf } from "../execution/VsPpPdfRenderer.js";
import { buildGePpDeclaration } from "../execution/GePpFormBuilder.js";
import { renderGePpPdf } from "../execution/GePpPdfRenderer.js";
import { buildVdPpDeclaration } from "../execution/VdPpFormBuilder.js";
import { renderVdPpPdf } from "../execution/VdPpPdfRenderer.js";
import { buildFrPpDeclaration } from "../execution/FrPpFormBuilder.js";
import { renderFrPpPdf } from "../execution/FrPpPdfRenderer.js";
import { buildNePpDeclaration } from "../execution/NePpFormBuilder.js";
import { renderNePpPdf } from "../execution/NePpPdfRenderer.js";
import { buildJuPpDeclaration } from "../execution/JuPpFormBuilder.js";
import { renderJuPpPdf } from "../execution/JuPpPdfRenderer.js";
import { buildBjPpDeclaration } from "../execution/BjPpFormBuilder.js";
import { renderBjPpPdf } from "../execution/BjPpPdfRenderer.js";
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

// POST /taxpayers/draft/submit-fr — génère le PDF PP Fribourg à partir du draft
taxpayersRouter.post("/draft/submit-fr", async (req, res) => {
  const parse = TaxpayerDraftSubmitSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { fiscalYear } = parse.data;

  try {
    const draft = await getOrCreateDraft(req.tenantId, fiscalYear);

    const form = await buildFrPpDeclaration({
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

    const pdfBuffer = await renderFrPpPdf(form);

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
    console.error("[taxpayers.submit-fr]", err);
    res.status(500).json({ error: "submit-fr failed", message });
  }
});

// POST /taxpayers/draft/submit-ne — génère le PDF PP Neuchâtel à partir du draft
taxpayersRouter.post("/draft/submit-ne", async (req, res) => {
  const parse = TaxpayerDraftSubmitSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { fiscalYear } = parse.data;

  try {
    const draft = await getOrCreateDraft(req.tenantId, fiscalYear);

    const form = await buildNePpDeclaration({
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

    const pdfBuffer = await renderNePpPdf(form);

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
    console.error("[taxpayers.submit-ne]", err);
    res.status(500).json({ error: "submit-ne failed", message });
  }
});

// POST /taxpayers/draft/submit-ju — génère le PDF PP Jura à partir du draft
taxpayersRouter.post("/draft/submit-ju", async (req, res) => {
  const parse = TaxpayerDraftSubmitSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { fiscalYear } = parse.data;

  try {
    const draft = await getOrCreateDraft(req.tenantId, fiscalYear);

    const form = await buildJuPpDeclaration({
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

    const pdfBuffer = await renderJuPpPdf(form);

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
    console.error("[taxpayers.submit-ju]", err);
    res.status(500).json({ error: "submit-ju failed", message });
  }
});

// POST /taxpayers/draft/submit-bj — génère le PDF PP Jura bernois à partir du draft
taxpayersRouter.post("/draft/submit-bj", async (req, res) => {
  const parse = TaxpayerDraftSubmitSchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { fiscalYear } = parse.data;

  try {
    const draft = await getOrCreateDraft(req.tenantId, fiscalYear);

    const form = await buildBjPpDeclaration({
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

    const pdfBuffer = await renderBjPpPdf(form);

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
    console.error("[taxpayers.submit-bj]", err);
    res.status(500).json({ error: "submit-bj failed", message });
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

// ─── Session 24 — auto-fill provenance ─────────────────────────────────────

const fieldSourcesQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear()),
});

/**
 * GET /taxpayers/draft/:year/field-sources — session 24
 *
 * Retourne un dictionnaire fieldPath → source du document qui a pré-rempli
 * ce champ. Si plusieurs documents ont touché le même champ, le plus récent
 * est retenu.
 *
 * Ex: { "step2.salaireBrut": { documentId, filename, appliedAt } }
 */
taxpayersRouter.get("/draft/:year/field-sources", async (req, res) => {
  const parse = fieldSourcesQuerySchema.safeParse({ year: req.params.year });
  if (!parse.success) {
    return res.status(400).json({ error: "invalid year param" });
  }
  const fiscalYear = parse.data.year;
  const tenantId = req.tenantId!;

  try {
    // 1. Trouver le draft
    const draftRes = await queryAsTenant<{ id: string }>(
      tenantId,
      `SELECT id FROM taxpayer_drafts WHERE tenant_id=$1 AND fiscal_year=$2 LIMIT 1`,
      [tenantId, fiscalYear],
    );
    if (draftRes.rows.length === 0) {
      return res.json({});
    }
    const draftId = draftRes.rows[0].id;

    // 2. Trouver les documents qui ont été appliqués à ce draft
    const db = getDb();
    const docs = await db
      .collection("documents_meta")
      .find(
        { tenantId, "appliedToDrafts.draftId": draftId },
        { projection: { _id: 0, documentId: 1, filename: 1, appliedToDrafts: 1 } },
      )
      .toArray();

    // 3. Construire le reverse map fieldPath → source (plus récente)
    const sourceMap: Record<
      string,
      { documentId: string; filename: string; appliedAt: string }
    > = {};

    for (const doc of docs) {
      const entries = (doc.appliedToDrafts ?? []) as Array<{
        draftId: string;
        fiscalYear: number;
        fieldsApplied: string[];
        appliedAt: Date | string;
      }>;
      for (const entry of entries) {
        if (entry.draftId !== draftId) continue;
        for (const fieldPath of entry.fieldsApplied ?? []) {
          const appliedAt = entry.appliedAt instanceof Date
            ? entry.appliedAt.toISOString()
            : String(entry.appliedAt);
          const existing = sourceMap[fieldPath];
          if (!existing || appliedAt > existing.appliedAt) {
            sourceMap[fieldPath] = {
              documentId: doc.documentId as string,
              filename: doc.filename as string,
              appliedAt,
            };
          }
        }
      }
    }

    return res.json(sourceMap);
  } catch (err) {
    console.error("[taxpayers.field-sources]", err);
    return res.status(500).json({ error: "field-sources failed", message: (err as Error).message });
  }
});

// ─── Export XML eCH-0119 PP ───────────────────────────────────────────────────

const SUPPORTED_CANTONS_XML = ["VS", "GE", "VD", "FR"] as const;

/**
 * GET /taxpayers/draft/:year/export-xml?canton=VS
 *
 * Génère un fichier XML eCH-0119 v4.0.0 (E-Tax Filing PP) à partir du draft
 * du contribuable. Utilisé pour la dépose électronique auprès de l'AFC.
 *
 * Le fichier XML est conforme au standard suisse eCH-0119 v4.0.0 :
 * https://www.ech.ch/fr/ech/ech-0119/4.0.0
 */
taxpayersRouter.get("/draft/:year/export-xml", async (req, res) => {
  const yearParse = z.coerce.number().int().min(2020).max(2100).safeParse(req.params.year);
  if (!yearParse.success) {
    return res.status(400).json({ error: "invalid year param" });
  }
  const year = yearParse.data;
  const canton = ((req.query.canton as string) ?? "VS").toUpperCase();

  if (!SUPPORTED_CANTONS_XML.includes(canton as typeof SUPPORTED_CANTONS_XML[number])) {
    return res.status(400).json({ error: `canton '${canton}' non supporté — cantons valides: ${SUPPORTED_CANTONS_XML.join(", ")}` });
  }

  try {
    const draft = await getOrCreateDraft(req.tenantId, year);
    const s1 = draft.state.step1 ?? {} as typeof draft.state.step1;
    const s2 = draft.state.step2 ?? {} as typeof draft.state.step2;
    const s3 = draft.state.step3 ?? {} as typeof draft.state.step3;
    const s4 = draft.state.step4 ?? {} as typeof draft.state.step4;

    const xml = generateEch0119PpXml({
      year,
      canton,
      identity: {
        firstName: s1.firstName,
        lastName: s1.lastName,
        dateOfBirth: s1.dateOfBirth,
        civilStatus: s1.civilStatus,
        commune: s1.commune,
        childrenCount: s1.childrenCount,
      },
      revenues: {
        salaireBrut: s2.salaireBrut,
        revenusAccessoires: s2.revenusAccessoires,
        rentesAvs: s2.rentesAvs,
        rentesLpp: s2.rentesLpp,
        rentes3ePilier: s2.rentes3ePilier,
        allocations: s2.allocations,
        revenusTitres: s2.revenusTitres,
        revenusImmobiliers: s2.revenusImmobiliers,
      },
      assets: {
        comptesBancaires: s3.comptesBancaires,
        titresCotes: s3.titresCotes,
        titresNonCotes: s3.titresNonCotes,
        immeublesValeurFiscale: s3.immeublesValeurFiscale,
        immeublesEmprunt: s3.immeublesEmprunt,
        vehicules: s3.vehicules,
        autresBiens: s3.autresBiens,
        dettes: s3.dettes,
      },
      deductions: {
        pilier3a: s4.pilier3a,
        primesAssurance: s4.primesAssurance,
        fraisProFormat: s4.fraisProFormat,
        fraisProReels: s4.fraisProReels,
        interetsPassifs: s4.interetsPassifs,
        rachatsLpp: s4.rachatsLpp,
        fraisMedicaux: s4.fraisMedicaux,
        dons: s4.dons,
      },
    });

    const fullName = `${s1.lastName ?? "contribuable"}-${s1.firstName ?? ""}`.replace(/\s+/g, "_").replace(/^-/, "");
    const filename = `declaration-pp-${canton.toLowerCase()}-${year}-${fullName}.xml`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(xml);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[taxpayers.export-xml]", err);
    return res.status(500).json({ error: "export-xml failed", message });
  }
});
