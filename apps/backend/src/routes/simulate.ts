/**
 * Routes simulate — Simulations fiscales "et si ?" (session 31)
 *
 * POST /simulate/rachat-lpp       — simulation rachat LPP (LIFD art. 33 al. 1 let. d)
 * POST /simulate/pilier-3a        — simulation variation pilier 3a (LIFD art. 33 al. 1 let. e)
 * POST /simulate/dividend-vs-salary — comparaison dividende vs salaire (LIFD art. 20 al. 1bis)
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  simulateRachatLpp,
  simulatePilier3aVariation,
  simulateDividendVsSalary,
} from "../services/TaxSimulator.js";

export const simulateRouter = Router();

// ── Schémas Zod ───────────────────────────────────────────────────────────────

const CantonSchema = z.enum(["VS", "GE", "VD", "FR"]);
const YearSchema = z.coerce.number().int().min(2020).max(2100);
const CivilStatusSchema = z.enum(["single", "married"]).optional();

const RachatLppSchema = z.object({
  canton: CantonSchema,
  year: YearSchema,
  currentIncome: z.number().min(0).max(10_000_000),
  additionalLppPurchase: z.number().min(1).max(1_000_000),
  civilStatus: CivilStatusSchema,
});

const Pilier3aSchema = z.object({
  canton: CantonSchema,
  year: YearSchema,
  currentIncome: z.number().min(0).max(10_000_000),
  current3a: z.number().min(0).max(40_000),
  target3a: z.number().min(0).max(40_000),
  hasLpp: z.boolean().optional(),
  civilStatus: CivilStatusSchema,
});

const DividendVsSalarySchema = z.object({
  amountAvailable: z.number().min(1).max(10_000_000),
  shareholderMarginalRate: z.number().min(0).max(1),
  canton: CantonSchema,
  legalForm: z.enum(["sarl", "sa"]),
});

// ── POST /simulate/rachat-lpp ─────────────────────────────────────────────────

simulateRouter.post("/rachat-lpp", requireAuth, (req, res) => {
  const parse = RachatLppSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.flatten() });
  }
  try {
    const result = simulateRachatLpp(parse.data);
    return res.json(result);
  } catch (err) {
    console.error("[simulate.rachat-lpp]", err);
    return res.status(500).json({ error: "simulation failed", message: (err as Error).message });
  }
});

// ── POST /simulate/pilier-3a ──────────────────────────────────────────────────

simulateRouter.post("/pilier-3a", requireAuth, (req, res) => {
  const parse = Pilier3aSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.flatten() });
  }
  try {
    const result = simulatePilier3aVariation(parse.data);
    return res.json(result);
  } catch (err) {
    console.error("[simulate.pilier-3a]", err);
    return res.status(500).json({ error: "simulation failed", message: (err as Error).message });
  }
});

// ── POST /simulate/dividend-vs-salary ────────────────────────────────────────

simulateRouter.post("/dividend-vs-salary", requireAuth, (req, res) => {
  const parse = DividendVsSalarySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.flatten() });
  }
  try {
    const result = simulateDividendVsSalary(parse.data);
    return res.json(result);
  } catch (err) {
    console.error("[simulate.dividend-vs-salary]", err);
    return res.status(500).json({ error: "simulation failed", message: (err as Error).message });
  }
});
