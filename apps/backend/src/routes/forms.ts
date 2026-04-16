import { Router } from "express";
import { z } from "zod";
import { buildDecompteTva } from "../execution/TvaFormBuilder.js";
import { buildDecompteTvaAnnual } from "../execution/TvaAnnualFormBuilder.js";
import {
  buildDecompteTdfn,
  loadTdfnRates,
  type TdfnRate,
} from "../execution/TdfnFormBuilder.js";
import { renderDecompteTvaPdf } from "../execution/TvaPdfRenderer.js";
import { renderDecompteTvaXml } from "../execution/TvaXmlBuilder.js";
import {
  appendDeclarationEvent,
  appendVsPpDeclarationEvent,
  findExistingDeclaration,
  findExistingVsPpDeclaration,
} from "../execution/idempotence.js";
import { buildVsPpDeclaration } from "../execution/VsPpFormBuilder.js";
import { renderVsPpPdf } from "../execution/VsPpPdfRenderer.js";
import { buildGePpDeclaration } from "../execution/GePpFormBuilder.js";
import { renderGePpPdf } from "../execution/GePpPdfRenderer.js";
import { buildVdPpDeclaration } from "../execution/VdPpFormBuilder.js";
import { renderVdPpPdf } from "../execution/VdPpPdfRenderer.js";
import { buildFrPpDeclaration } from "../execution/FrPpFormBuilder.js";
import { renderFrPpPdf } from "../execution/FrPpPdfRenderer.js";
import { buildPmDeclarationVs } from "../execution/PmFormBuilder.js";
import {
  buildSwissdecCertificate,
  CertificateInput,
} from "../execution/SwissdecCertificateBuilder.js";
import { requireAuth } from "../middleware/requireAuth.js";
import type { FilledForm } from "../execution/types.js";

export const formsRouter = Router();

async function finalizeForm(form: FilledForm, tdfnRate?: TdfnRate) {
  const quarter =
    form.period.kind === "quarterly" ? form.period.quarter : undefined;

  const existing = await findExistingDeclaration({
    tenantId: form.company.tenantId,
    formId: form.formId,
    version: form.version,
    method: form.method,
    year: form.period.year,
    quarter,
  });

  const [pdfBuffer, xml] = await Promise.all([
    renderDecompteTvaPdf(form, { tdfnRate }),
    Promise.resolve(renderDecompteTvaXml(form)),
  ]);

  let streamId: string;
  let eventId: number;
  let idempotent: boolean;

  if (existing) {
    streamId = existing.streamId;
    eventId = existing.eventId;
    idempotent = true;
  } else {
    const record = await appendDeclarationEvent(form);
    streamId = record.streamId;
    eventId = record.id;
    idempotent = false;
  }

  return {
    streamId,
    eventId,
    idempotent,
    form: {
      formId: form.formId,
      version: form.version,
      method: form.method,
      period: form.period,
      company: form.company,
      projection: form.projection,
      generatedAt: form.generatedAt,
      ...(tdfnRate && { tdfnRate }),
    },
    pdf: pdfBuffer.toString("base64"),
    xml,
  };
}

const tvaDecompteBodySchema = z.object({
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  year: z.number().int().min(2020).max(2100),
  method: z.enum(["effective", "tdfn"]).optional(),
  sectorCode: z.string().optional(),
});

/**
 * POST /forms/tva-decompte — décompte TVA AFC trimestriel (art. 71 LTVA).
 * Switch selon `method` :
 *   - "effective" (défaut) : TvaFormBuilder (3 taux, CA HT + impôt préalable)
 *   - "tdfn" : TdfnFormBuilder (1 taux net par secteur, art. 37 LTVA).
 * Idempotent sur (tenant, formId, version, method, year, quarter).
 */
formsRouter.post("/tva-decompte", async (req, res) => {
  const parse = tvaDecompteBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }
  const { quarter, year, method = "effective", sectorCode } = parse.data;
  try {
    if (method === "tdfn") {
      const form = await buildDecompteTdfn({
        tenantId: req.tenantId,
        year,
        quarter,
        sectorCode,
      });
      res.json(await finalizeForm(form, form.tdfnRate));
    } else {
      const form = await buildDecompteTva({
        tenantId: req.tenantId,
        quarter,
        year,
        method,
      });
      res.json(await finalizeForm(form));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[forms.tva-decompte]", err);
    res.status(500).json({ error: "tva-decompte failed", message });
  }
});

const tvaAnnualBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  method: z.enum(["effective", "tdfn"]).optional(),
  sectorCode: z.string().optional(),
});

/**
 * POST /forms/tva-decompte-annuel — décompte TVA AFC annuel récapitulatif
 * (art. 72 LTVA). Consolide l'ensemble des events TransactionClassified de
 * l'année complète. Idempotent sur (tenant, formId, version, method, year).
 */
formsRouter.post("/tva-decompte-annuel", async (req, res) => {
  const parse = tvaAnnualBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }
  const { year, method = "effective", sectorCode } = parse.data;
  try {
    if (method === "tdfn") {
      const form = await buildDecompteTdfn({
        tenantId: req.tenantId,
        year,
        sectorCode,
      });
      res.json(await finalizeForm(form, form.tdfnRate));
    } else {
      const form = await buildDecompteTvaAnnual({
        tenantId: req.tenantId,
        year,
        method,
      });
      res.json(await finalizeForm(form));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[forms.tva-decompte-annuel]", err);
    res.status(500).json({ error: "tva-decompte-annuel failed", message });
  }
});

/**
 * GET /forms/tdfn-rates — liste des taux TDFN disponibles (lecture seule).
 * Permet au frontend de proposer un select secteur au user.
 */
formsRouter.get("/tdfn-rates", async (_req, res) => {
  try {
    const rates = await loadTdfnRates();
    res.json({
      version: rates.version,
      authority: rates.authority,
      source: rates.source_circular,
      rates: rates.rates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: "tdfn-rates failed", message });
  }
});

// ── Déclaration fiscale PP Valais ──────────────────────

const vsPpBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
});

/**
 * POST /forms/vs-declaration-pp — déclaration fiscale PP Canton du Valais.
 * Projection comptable simplifiée : revenu indépendant, fortune nette,
 * frais pro forfaitaires. Les champs personnels (salaire, pilier 3a, LPP,
 * assurances, intérêts dette) restent à compléter manuellement.
 * Idempotent sur (tenant, formId, version, year).
 */
formsRouter.post("/vs-declaration-pp", async (req, res) => {
  const parse = vsPpBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }
  const { year } = parse.data;
  try {
    const form = await buildVsPpDeclaration({
      tenantId: req.tenantId,
      year,
    });

    const existing = await findExistingVsPpDeclaration({
      tenantId: form.company.tenantId,
      formId: form.formId,
      version: form.version,
      year: form.year,
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
    console.error("[forms.vs-declaration-pp]", err);
    res.status(500).json({ error: "vs-declaration-pp failed", message });
  }
});

// ── Déclaration fiscale PP Genève ──────────────────────

const gePpBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  draft: z
    .object({
      step1: z.record(z.unknown()).optional(),
      step2: z.record(z.unknown()).optional(),
      step3: z.record(z.unknown()).optional(),
      step4: z.record(z.unknown()).optional(),
    })
    .optional(),
});

/**
 * POST /forms/ge-declaration-pp — déclaration fiscale PP Canton de Genève.
 * Clone du endpoint VS-PP, adapté aux spécificités genevoises :
 * forfait frais pro min 1'700 CHF, pilier 3a salarié 7'260 CHF (2026),
 * centime additionnel cantonal 47.5%, disclaimer LIPP (RSG D 3 08).
 * Idempotent sur (tenant, formId, version, year).
 */
formsRouter.post("/ge-declaration-pp", async (req, res) => {
  const parse = gePpBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }
  const { year, draft } = parse.data;
  try {
    const form = await buildGePpDeclaration({
      tenantId: req.tenantId,
      year,
      draft: draft as Parameters<typeof buildGePpDeclaration>[0]["draft"],
    });

    const existing = await findExistingVsPpDeclaration({
      tenantId: form.company.tenantId,
      formId: form.formId,
      version: form.version,
      year: form.year,
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
    console.error("[forms.ge-declaration-pp]", err);
    res.status(500).json({ error: "ge-declaration-pp failed", message });
  }
});

// ── Déclaration fiscale PP Vaud ────────────────────────

const vdPpBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  coefficientCommunal: z.number().int().min(1).max(200).optional(),
  draft: z
    .object({
      step1: z.record(z.unknown()).optional(),
      step2: z.record(z.unknown()).optional(),
      step3: z.record(z.unknown()).optional(),
      step4: z.record(z.unknown()).optional(),
    })
    .optional(),
});

/**
 * POST /forms/vd-declaration-pp — déclaration fiscale PP Canton de Vaud.
 * Clone du endpoint GE-PP, adapté aux spécificités vaudoises :
 * - forfait frais pro min 2'000 CHF, max 4'000 CHF (3%) — TODO session 20 : confirmer ACI VD Art. 26 LI
 * - pilier 3a salarié 7'260 CHF (avec LPP), 36'288 CHF (sans LPP) — 2026
 * - coefficient communal (défaut 79 = Lausanne 2026) au lieu de centimes additionnels GE
 * - PAS de forfait frontalier (VD n'a pas de régime frontalier significatif)
 * - disclaimer LI (BLV 642.11), LIPC (BLV 650.11), LIFD
 * - autorité ACI VD, délai dépôt : 15 mars
 * Idempotent sur (tenant, formId, version, year).
 */
formsRouter.post("/vd-declaration-pp", async (req, res) => {
  const parse = vdPpBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }
  const { year, draft, coefficientCommunal } = parse.data;
  try {
    const form = await buildVdPpDeclaration({
      tenantId: req.tenantId,
      year,
      draft: draft as Parameters<typeof buildVdPpDeclaration>[0]["draft"],
      coefficientCommunal,
    });

    const existing = await findExistingVsPpDeclaration({
      tenantId: form.company.tenantId,
      formId: form.formId,
      version: form.version,
      year: form.year,
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
    console.error("[forms.vd-declaration-pp]", err);
    res.status(500).json({ error: "vd-declaration-pp failed", message });
  }
});

// ── Déclaration fiscale PP Fribourg ───────────────────────────────────────────

const frPpBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  draft: z
    .object({
      step1: z.record(z.unknown()).optional(),
      step2: z.record(z.unknown()).optional(),
      step3: z.record(z.unknown()).optional(),
      step4: z.record(z.unknown()).optional(),
    })
    .optional(),
});

/**
 * POST /forms/fr-declaration-pp — déclaration fiscale PP Canton de Fribourg.
 * Clone du endpoint VD-PP, adapté aux spécificités fribourgeoises :
 * - forfait frais pro min 1'700 CHF, max 3'400 CHF (3%)
 *   TODO session 23 : confirmer barème SCC FR ORD-FP (BDLF 631.411)
 * - pilier 3a salarié 7'260 CHF (avec LPP), 36'288 CHF (sans LPP) — 2026
 * - PAS de coefficient communal (FR utilise un autre système)
 * - PAS de régime frontalier spécifique
 * - disclaimer LICD (BDLF 631.1), LIC (BDLF 632.1), ORD-FP (BDLF 631.411), LIFD
 * - autorité SCC FR, délai dépôt : 31 mars
 * Idempotent sur (tenant, formId, version, year).
 */
formsRouter.post("/fr-declaration-pp", async (req, res) => {
  const parse = frPpBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }
  const { year, draft } = parse.data;
  try {
    const form = await buildFrPpDeclaration({
      tenantId: req.tenantId,
      year,
      draft: draft as Parameters<typeof buildFrPpDeclaration>[0]["draft"],
    });

    const existing = await findExistingVsPpDeclaration({
      tenantId: form.company.tenantId,
      formId: form.formId,
      version: form.version,
      year: form.year,
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
    console.error("[forms.fr-declaration-pp]", err);
    res.status(500).json({ error: "fr-declaration-pp failed", message });
  }
});

// ── Déclaration fiscale PM Valais (V1 — calcul structurel, pas de PDF) ────────

const pmDeclarationVsBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  company: z.object({
    legalName: z.string().min(1).max(200),
    legalForm: z.enum(["sarl", "sa"]),
    ideNumber: z.string().optional(),
    canton: z.string().default("VS"),
    commune: z.string().optional(),
    registeredOffice: z.string().optional(),
  }),
  financials: z.object({
    benefitAccounting: z.number(),
    corrections: z.number(),
    capital: z.number().min(0),
    dividendsPaid: z.number().optional(),
  }),
});

/**
 * POST /forms/pm-declaration-vs — déclaration fiscale PM Canton du Valais (V1).
 *
 * Calcule le bénéfice imposable (comptable + corrections) et estime :
 *   - IFD 8.5% (art. 68 LIFD)
 *   - ICC VS ~8.5% (simplifié V1 — TODO session 28+ : taux officiels)
 *   - Impôt sur capital 0.15% (simplifié V1)
 *
 * V1 : pas de rendu PDF — retourne les données structurées + citations légales.
 * Le PDF arrives en session 27 avec le wizard PM frontend.
 * requireAuth : l'accès aux données PM est strictement authifié.
 */
formsRouter.post("/pm-declaration-vs", requireAuth, async (req, res) => {
  const parse = pmDeclarationVsBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }
  const { year, company, financials } = parse.data;
  try {
    const declaration = buildPmDeclarationVs({
      tenantId: req.tenantId,
      year,
      draft: { company, year, financials },
    });

    res.json(declaration);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[forms.pm-declaration-vs]", err);
    res.status(500).json({ error: "pm-declaration-vs failed", message });
  }
});

// ── Certificat de salaire Swissdec (Form 11) — Session 34 ────────────────────

/**
 * POST /forms/swissdec-certificate — Génère un certificat de salaire conforme
 * Swissdec Guidelines 5.0 (Lohnausweis Form 11).
 *
 * Input : employer, employee, year, period, cases (1-15 Swissdec normalisées).
 * Output : { pdfBase64, structuredData, citations, generatedAt }
 *
 * V1 : pas de transmission électronique eCH-0217, pas de calcul paie auto.
 * Base légale : LIFD art. 127 al. 1 lit. a + Swissdec Guidelines 5.0.
 */
formsRouter.post("/swissdec-certificate", requireAuth, async (req, res) => {
  const parse = CertificateInput.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.issues });
  }
  try {
    const result = await buildSwissdecCertificate(parse.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[forms.swissdec-certificate]", err);
    res.status(500).json({ error: "swissdec-certificate failed", message });
  }
});
