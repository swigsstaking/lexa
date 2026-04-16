/**
 * Routes PM — Déclarations personnes morales (Sàrl/SA)
 * Session 27 — wizard PM VS end-to-end
 *
 * POST   /companies/draft            — créer/upsert draft PM
 * GET    /companies/draft/:year      — lire draft PM (?canton=VS)
 * PATCH  /companies/draft/:year      — auto-save dot-path partiel
 * POST   /companies/draft/:year/submit-vs — générer PDF PM VS
 */

import { Router } from "express";
import { z } from "zod";
import { query, queryAsTenant } from "../db/postgres.js";
import { buildPmDeclarationVs, buildPmDeclaration, type PmDraft, type Canton } from "../execution/PmFormBuilder.js";
import { renderPmPdf } from "../execution/PmPdfRenderer.js";

export const companiesRouter = Router();

const VALID_CANTONS = ["VS", "GE", "VD", "FR", "NE", "JU", "BJ"] as const;
type Canton = typeof VALID_CANTONS[number];

// ── Utilitaire dot-path setter ───────────────────────────────────────────────
// "step2.benefitAccounting" → { step2: { benefitAccounting: value } }
// Merge profond avec l'état existant.

function setDeep(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  const result = { ...obj };
  let current: Record<string, unknown> = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    current[k] = current[k] && typeof current[k] === "object" && !Array.isArray(current[k])
      ? { ...(current[k] as Record<string, unknown>) }
      : {};
    current = current[k] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

// ── Schémas Zod ──────────────────────────────────────────────────────────────

const createDraftSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  canton: z.enum(VALID_CANTONS).default("VS"),
  legalName: z.string().min(1).max(200),
});

const patchDraftSchema = z.object({
  canton: z.enum(VALID_CANTONS).default("VS"),
  path: z.string().min(1).max(100),
  value: z.unknown(),
});

const yearParamSchema = z.coerce.number().int().min(2020).max(2100);

// ── POST /companies/draft — créer ou upsert ──────────────────────────────────

companiesRouter.post("/draft", async (req, res) => {
  const parse = createDraftSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { year, canton, legalName } = parse.data;
  const tenantId = req.tenantId;

  try {
    // Upsert : si draft existe, on met à jour le legalName dans step1
    const existing = await queryAsTenant<{ id: string; state: Record<string, unknown> }>(
      tenantId,
      `SELECT id, state FROM company_drafts WHERE tenant_id=$1 AND year=$2 AND canton=$3 LIMIT 1`,
      [tenantId, year, canton],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const state = row.state as Record<string, unknown>;
      const step1 = (state.step1 ?? {}) as Record<string, unknown>;
      const newState = { ...state, step1: { ...step1, legalName } };
      await queryAsTenant(
        tenantId,
        `UPDATE company_drafts SET state=$1 WHERE id=$2`,
        [JSON.stringify(newState), row.id],
      );
      return res.json({ id: row.id, state: newState });
    }

    // Créer nouveau draft
    const initState = { step1: { legalName } };
    const result = await queryAsTenant<{ id: string; state: Record<string, unknown> }>(
      tenantId,
      `INSERT INTO company_drafts (tenant_id, year, canton, state)
       VALUES ($1, $2, $3, $4)
       RETURNING id, state`,
      [tenantId, year, canton, JSON.stringify(initState)],
    );
    return res.status(201).json({ id: result.rows[0].id, state: result.rows[0].state });
  } catch (err) {
    console.error("[companies.draft.create]", err);
    return res.status(500).json({ error: "draft create failed" });
  }
});

// ── GET /companies/draft/:year — lire ────────────────────────────────────────

companiesRouter.get("/draft/:year", async (req, res) => {
  const yearParse = yearParamSchema.safeParse(req.params.year);
  if (!yearParse.success) {
    return res.status(400).json({ error: "invalid year param" });
  }
  const year = yearParse.data;
  const canton = (req.query.canton as Canton) ?? "VS";
  if (!VALID_CANTONS.includes(canton)) {
    return res.status(400).json({ error: "invalid canton" });
  }
  const tenantId = req.tenantId;

  try {
    const result = await queryAsTenant<{
      id: string;
      tenant_id: string;
      year: number;
      canton: string;
      state: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(
      tenantId,
      `SELECT id, tenant_id, year, canton, state, created_at, updated_at
       FROM company_drafts
       WHERE tenant_id=$1 AND year=$2 AND canton=$3
       LIMIT 1`,
      [tenantId, year, canton],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "draft not found" });
    }

    const row = result.rows[0];
    return res.json({
      id: row.id,
      tenantId: row.tenant_id,
      year: row.year,
      canton: row.canton,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error("[companies.draft.get]", err);
    return res.status(500).json({ error: "draft fetch failed" });
  }
});

// ── PATCH /companies/draft/:year — auto-save dot-path ────────────────────────

companiesRouter.patch("/draft/:year", async (req, res) => {
  const yearParse = yearParamSchema.safeParse(req.params.year);
  if (!yearParse.success) {
    return res.status(400).json({ error: "invalid year param" });
  }
  const year = yearParse.data;

  const parse = patchDraftSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.flatten() });
  }
  const { canton, path, value } = parse.data;
  const tenantId = req.tenantId;

  try {
    // Récupère l'état actuel
    const result = await queryAsTenant<{ id: string; state: Record<string, unknown> }>(
      tenantId,
      `SELECT id, state FROM company_drafts WHERE tenant_id=$1 AND year=$2 AND canton=$3 LIMIT 1`,
      [tenantId, year, canton],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "draft not found" });
    }

    const row = result.rows[0];
    const newState = setDeep(row.state, path, value);

    await queryAsTenant(
      tenantId,
      `UPDATE company_drafts SET state=$1 WHERE id=$2`,
      [JSON.stringify(newState), row.id],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("[companies.draft.patch]", err);
    return res.status(500).json({ error: "draft patch failed" });
  }
});

// ── POST /companies/draft/:year/submit-vs — générer PDF PM VS ────────────────

companiesRouter.post("/draft/:year/submit-vs", async (req, res) => {
  const yearParse = yearParamSchema.safeParse(req.params.year);
  if (!yearParse.success) {
    return res.status(400).json({ error: "invalid year param" });
  }
  const year = yearParse.data;
  const tenantId = req.tenantId;

  try {
    // 1. Charger le draft VS
    const result = await queryAsTenant<{ id: string; state: Record<string, unknown> }>(
      tenantId,
      `SELECT id, state FROM company_drafts WHERE tenant_id=$1 AND year=$2 AND canton='VS' LIMIT 1`,
      [tenantId, year],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "draft VS not found — créez un brouillon d'abord" });
    }

    const state = result.rows[0].state as {
      step1?: {
        legalName?: string;
        legalForm?: "sarl" | "sa" | "association" | "fondation";
        ideNumber?: string;
        siegeStreet?: string;
        siegeZip?: string;
        siegeCommune?: string;
        fiscalYearStart?: string;
        fiscalYearEnd?: string;
      };
      step2?: {
        chiffreAffaires?: number;
        produits?: number;
        chargesPersonnel?: number;
        chargesMaterielles?: number;
        amortissementsComptables?: number;
        autresCharges?: number;
        benefitAccounting?: number;
      };
      step3?: {
        chargesNonAdmises?: number;
        provisionsExcessives?: number;
        amortissementsExcessifs?: number;
        reservesLatentes?: number;
        autresCorrections?: number;
      };
      step4?: {
        capitalSocial?: number;
        reservesLegales?: number;
        reservesLibres?: number;
        reportBenefice?: number;
        capitalTotal?: number;
      };
    };

    // 2. Mapper state → PmDraft
    const pmDraft: PmDraft = mapStateToPmDraft(state, year);

    // 3. Construire la déclaration via PmFormBuilder
    const formResult = buildPmDeclarationVs({ tenantId, year, draft: pmDraft });

    // 4. Rendre le PDF
    const pdfBuffer = await renderPmPdf(formResult);

    return res.json({
      formId: formResult.formId,
      pdfBase64: pdfBuffer.toString("base64"),
      structuredData: formResult,
      taxEstimate: formResult.taxEstimate,
      citations: formResult.citations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[companies.submit-vs]", err);
    return res.status(500).json({ error: "submit-vs failed", message });
  }
});

// ── POST /companies/draft/:year/submit-{ge,vd,fr} — génériques ───────────────
// Clone strict de submit-vs avec buildPmDeclaration(canton)

function makeSubmitRoute(canton: Canton) {
  return async (req: import("express").Request, res: import("express").Response) => {
    const yearParse = yearParamSchema.safeParse(req.params.year);
    if (!yearParse.success) {
      return res.status(400).json({ error: "invalid year param" });
    }
    const year = yearParse.data;
    const tenantId = req.tenantId;

    try {
      const result = await queryAsTenant<{ id: string; state: Record<string, unknown> }>(
        tenantId,
        `SELECT id, state FROM company_drafts WHERE tenant_id=$1 AND year=$2 AND canton=$3 LIMIT 1`,
        [tenantId, year, canton],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: `draft ${canton} not found — créez un brouillon d'abord` });
      }

      const state = result.rows[0].state as Parameters<typeof mapStateToPmDraft>[0];
      const pmDraft: PmDraft = mapStateToPmDraft(state, year, canton);
      const formResult = buildPmDeclaration(canton, { tenantId, year, draft: pmDraft });
      const pdfBuffer = await renderPmPdf(formResult);

      return res.json({
        formId: formResult.formId,
        pdfBase64: pdfBuffer.toString("base64"),
        structuredData: formResult,
        taxEstimate: formResult.taxEstimate,
        citations: formResult.citations,
        authority: formResult.authority,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`[companies.submit-${canton.toLowerCase()}]`, err);
      return res.status(500).json({ error: `submit-${canton.toLowerCase()} failed`, message });
    }
  };
}

companiesRouter.post("/draft/:year/submit-ge", makeSubmitRoute("GE"));
companiesRouter.post("/draft/:year/submit-vd", makeSubmitRoute("VD"));
companiesRouter.post("/draft/:year/submit-fr", makeSubmitRoute("FR"));

// ── Mapping state JSONB → PmDraft ────────────────────────────────────────────

function mapStateToPmDraft(state: {
  step1?: {
    legalName?: string;
    legalForm?: "sarl" | "sa" | "association" | "fondation";
    ideNumber?: string;
    siegeStreet?: string;
    siegeZip?: string;
    siegeCommune?: string;
    fiscalYearStart?: string;
    fiscalYearEnd?: string;
  };
  step2?: {
    chiffreAffaires?: number;
    produits?: number;
    chargesPersonnel?: number;
    chargesMaterielles?: number;
    amortissementsComptables?: number;
    autresCharges?: number;
    benefitAccounting?: number;
  };
  step3?: {
    chargesNonAdmises?: number;
    provisionsExcessives?: number;
    amortissementsExcessifs?: number;
    reservesLatentes?: number;
    autresCorrections?: number;
  };
  step4?: {
    capitalSocial?: number;
    reservesLegales?: number;
    reservesLibres?: number;
    reportBenefice?: number;
    capitalTotal?: number;
  };
}, year: number, canton: Canton = "VS"): PmDraft {
  const s1 = state.step1 ?? {};
  const s2 = state.step2 ?? {};
  const s3 = state.step3 ?? {};
  const s4 = state.step4 ?? {};

  // Corrections totales = somme des charges non admises + provisions + amortissements excédentaires
  const corrections =
    (s3.chargesNonAdmises ?? 0) +
    (s3.provisionsExcessives ?? 0) +
    (s3.amortissementsExcessifs ?? 0) +
    (s3.reservesLatentes ?? 0) +
    (s3.autresCorrections ?? 0);

  // Capital imposable = capitalTotal si saisi, sinon somme des composantes
  const capital = s4.capitalTotal ??
    (
      (s4.capitalSocial ?? 0) +
      (s4.reservesLegales ?? 0) +
      (s4.reservesLibres ?? 0) +
      (s4.reportBenefice ?? 0)
    );

  // Forme juridique : on accepte "association" et "fondation" mais on les traite comme "sarl" pour l'imposition V1
  const rawForm = s1.legalForm ?? "sarl";
  const legalForm: "sarl" | "sa" = (rawForm === "sa") ? "sa" : "sarl";

  return {
    company: {
      legalName: s1.legalName ?? "Société inconnue",
      legalForm,
      ideNumber: s1.ideNumber,
      canton,
      commune: s1.siegeCommune,
      registeredOffice: s1.siegeStreet
        ? `${s1.siegeStreet}, ${s1.siegeZip ?? ""} ${s1.siegeCommune ?? ""}`.trim()
        : undefined,
    },
    year,
    financials: {
      benefitAccounting: s2.benefitAccounting ?? 0,
      corrections,
      capital,
    },
  };
}
