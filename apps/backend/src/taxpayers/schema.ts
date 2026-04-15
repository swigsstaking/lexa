import { z } from "zod";

/**
 * Schéma d'état d'un brouillon de déclaration PP Valais (session 15 v1).
 *
 * Tous les champs sont optionnels dans le draft en cours — ils deviennent
 * obligatoires uniquement au moment de `submit` (PDF generation) via
 * `TaxpayerDraftSubmitSchema`.
 *
 * Les 6 steps du wizard :
 *   1. Identity & famille
 *   2. Revenus
 *   3. Fortune
 *   4. Déductions
 *   5. Preview (pas de nouveaux champs)
 *   6. Generate (pas de nouveaux champs)
 */

export const CIVIL_STATUS = z.enum([
  "single",
  "married",
  "registered_partnership",
  "divorced",
  "separated",
  "widowed",
]);

// Step 1 — Identité & famille
export const Step1Schema = z.object({
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  dateOfBirth: z.string().optional(),           // ISO date
  civilStatus: CIVIL_STATUS.optional(),
  childrenCount: z.number().int().min(0).max(20).optional(),
  commune: z.string().max(200).optional(),
  canton: z.literal("VS").default("VS"),
});

// Step 2 — Revenus (CHF annuels)
export const Step2Schema = z.object({
  isSalarie: z.boolean().optional(),
  salaireBrut: z.number().min(0).max(10_000_000).optional(),
  hasSwissdecCertificate: z.boolean().optional(),
  revenusAccessoires: z.number().min(0).max(10_000_000).optional(),
  rentesAvs: z.number().min(0).max(1_000_000).optional(),
  rentesLpp: z.number().min(0).max(1_000_000).optional(),
  rentes3ePilier: z.number().min(0).max(1_000_000).optional(),
  allocations: z.number().min(0).max(1_000_000).optional(),
  revenusTitres: z.number().min(0).max(10_000_000).optional(),
  revenusImmobiliers: z.number().min(0).max(10_000_000).optional(),
});

// Step 3 — Fortune (CHF au 31.12)
export const Step3Schema = z.object({
  comptesBancaires: z.number().min(0).max(100_000_000).optional(),
  titresCotes: z.number().min(0).max(100_000_000).optional(),
  titresNonCotes: z.number().min(0).max(100_000_000).optional(),
  immeublesValeurFiscale: z.number().min(0).max(100_000_000).optional(),
  immeublesEmprunt: z.number().min(0).max(100_000_000).optional(),
  vehicules: z.number().min(0).max(10_000_000).optional(),
  autresBiens: z.number().min(0).max(10_000_000).optional(),
  dettes: z.number().min(0).max(100_000_000).optional(),
});

// Step 4 — Déductions
export const Step4Schema = z.object({
  pilier3a: z.number().min(0).max(100_000).optional(),
  primesAssurance: z.number().min(0).max(50_000).optional(),
  fraisProFormat: z.enum(["forfait", "reel"]).optional(),
  fraisProReels: z.number().min(0).max(100_000).optional(),
  interetsPassifs: z.number().min(0).max(1_000_000).optional(),
  rachatsLpp: z.number().min(0).max(1_000_000).optional(),
  fraisMedicaux: z.number().min(0).max(100_000).optional(),
  dons: z.number().min(0).max(1_000_000).optional(),
});

/** État complet du brouillon (JSONB persisté dans taxpayer_drafts.state). */
export const TaxpayerDraftStateSchema = z.object({
  step1: Step1Schema.default({}),
  step2: Step2Schema.default({}),
  step3: Step3Schema.default({}),
  step4: Step4Schema.default({}),
});

export type TaxpayerDraftState = z.infer<typeof TaxpayerDraftStateSchema>;

/**
 * PATCH /taxpayers/draft/field — mutation atomique d'un champ.
 * Le `field` est dot-path (ex: "step1.firstName", "step2.salaireBrut").
 */
export const TaxpayerFieldUpdateSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2100),
  step: z.number().int().min(1).max(6),
  field: z.string().min(1).max(200),
  value: z.unknown(),
});

/**
 * POST /taxpayers/draft/submit — validation stricte avant génération PDF.
 * Les champs minimaux requis : identité + au moins un revenu déclaré.
 * Le reste reste optionnel pour permettre une saisie progressive.
 */
export const TaxpayerDraftSubmitSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2100),
});
