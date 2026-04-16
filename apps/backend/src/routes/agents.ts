import { Router } from "express";
import { z } from "zod";
import { tvaAgent } from "../agents/tva/TvaAgent.js";
import { fiscalPpVsAgent } from "../agents/fiscalPpVs/FiscalPpVsAgent.js";
import { fiscalPpGeAgent } from "../agents/fiscalPpGe/FiscalPpGeAgent.js";
import { fiscalPpVdAgent } from "../agents/fiscalPpVd/FiscalPpVdAgent.js";
import { fiscalPpFrAgent } from "../agents/fiscalPpFr/FiscalPpFrAgent.js";
import { fiscalPpNeAgent } from "../agents/fiscalPpNe/FiscalPpNeAgent.js";
import { fiscalPpJuAgent } from "../agents/fiscalPpJu/FiscalPpJuAgent.js";
import { fiscalPpBjAgent } from "../agents/fiscalPpBj/FiscalPpBjAgent.js";
import { fiscalPmAgent } from "../agents/fiscalPm/FiscalPmAgent.js";
import { clotureAgent } from "../agents/cloture/ClotureAgent.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const agentsRouter = Router();

const TvaAskSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      turnover: z.number().optional(),
      method: z.enum(["effective", "tdfn"]).optional(),
      sector: z.string().optional(),
    })
    .optional(),
});

/** POST /agents/tva/ask — specialized VAT agent */
agentsRouter.post("/tva/ask", requireAuth, async (req, res) => {
  const parsed = TvaAskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await tvaAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("TVA agent error:", err);
    res.status(500).json({ error: "tva agent failed", message: (err as Error).message });
  }
});

const FiscalPpVsSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      status: z.enum(["salarie", "independant", "mixte"]).optional(),
      netIncome: z.number().optional(),
      commune: z.string().optional(),
      civilStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pp/ask — specialized VS personal income tax agent */
agentsRouter.post("/fiscal-pp/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPpVsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPpVsAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpVs agent error:", err);
    res.status(500).json({ error: "fiscal-pp agent failed", message: (err as Error).message });
  }
});

const FiscalPpGeSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      status: z
        .enum(["salarie", "independant", "mixte", "frontalier"])
        .optional(),
      netIncome: z.number().optional(),
      commune: z.string().optional(),
      civilStatus: z
        .enum(["single", "married", "divorced", "widowed"])
        .optional(),
      isPropertyOwner: z.boolean().optional(),
      hasForeignIncome: z.boolean().optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pp-ge/ask — specialized GE personal income tax agent */
agentsRouter.post("/fiscal-pp-ge/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPpGeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPpGeAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpGe agent error:", err);
    res.status(500).json({ error: "fiscal-pp-ge agent failed", message: (err as Error).message });
  }
});

const FiscalPpVdSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      status: z.enum(["salarie", "independant", "mixte"]).optional(),
      netIncome: z.number().optional(),
      commune: z.string().optional(),
      civilStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
      isPropertyOwner: z.boolean().optional(),
      isFrontalier: z.boolean().optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pp-vd/ask — specialized VD personal income tax agent */
agentsRouter.post("/fiscal-pp-vd/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPpVdSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPpVdAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpVd agent error:", err);
    res.status(500).json({ error: "fiscal-pp-vd agent failed", message: (err as Error).message });
  }
});

const FiscalPpFrSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      status: z.enum(["salarie", "independant", "mixte"]).optional(),
      netIncome: z.number().optional(),
      commune: z.string().optional(),
      district: z.string().optional(),
      civilStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
      isPropertyOwner: z.boolean().optional(),
      isBilingual: z.boolean().optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pp-fr/ask — specialized FR personal income tax agent */
agentsRouter.post("/fiscal-pp-fr/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPpFrSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPpFrAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpFr agent error:", err);
    res.status(500).json({ error: "fiscal-pp-fr agent failed", message: (err as Error).message });
  }
});

const FiscalPpNeSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      status: z.enum(["salarie", "independant", "mixte"]).optional(),
      netIncome: z.number().optional(),
      commune: z.string().optional(),
      civilStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
      isPropertyOwner: z.boolean().optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pp-ne/ask — specialized NE personal income tax agent */
agentsRouter.post("/fiscal-pp-ne/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPpNeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPpNeAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpNe agent error:", err);
    res.status(500).json({ error: "fiscal-pp-ne agent failed", message: (err as Error).message });
  }
});

const FiscalPpJuSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      status: z.enum(["salarie", "independant", "mixte"]).optional(),
      netIncome: z.number().optional(),
      commune: z.string().optional(),
      civilStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
      isPropertyOwner: z.boolean().optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pp-ju/ask — specialized JU personal income tax agent */
agentsRouter.post("/fiscal-pp-ju/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPpJuSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPpJuAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpJu agent error:", err);
    res.status(500).json({ error: "fiscal-pp-ju agent failed", message: (err as Error).message });
  }
});

const FiscalPpBjSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      status: z.enum(["salarie", "independant", "mixte"]).optional(),
      netIncome: z.number().optional(),
      commune: z.string().optional(),
      civilStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
      isPropertyOwner: z.boolean().optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pp-bj/ask — specialized BJ (Jura bernois) personal income tax agent */
agentsRouter.post("/fiscal-pp-bj/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPpBjSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPpBjAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpBj agent error:", err);
    res.status(500).json({ error: "fiscal-pp-bj agent failed", message: (err as Error).message });
  }
});

const FiscalPmAskSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z
    .object({
      legalForm: z.enum(["sarl", "sa", "association", "fondation", "autre"]).optional(),
      canton: z.enum(["VS", "GE", "VD", "FR", "NE", "JU", "BE"]).optional(),
      year: z.number().int().optional(),
      revenuNet: z.number().optional(),
      fondsPropres: z.number().optional(),
      ideNumber: z.string().optional(),
    })
    .optional(),
});

/** POST /agents/fiscal-pm/ask — specialized corporate income tax agent (Sàrl/SA) */
agentsRouter.post("/fiscal-pm/ask", requireAuth, async (req, res) => {
  const parsed = FiscalPmAskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await fiscalPmAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPm agent error:", err);
    res.status(500).json({ error: "fiscal-pm agent failed", message: (err as Error).message });
  }
});

const ClotureAskSchema = z.object({
  question: z.string().min(3).max(2000),
  year: z.number().int().optional(),
  balanceSheet: z
    .object({
      assetsTotal: z.number(),
      liabilitiesTotal: z.number(),
      equityTotal: z.number(),
      isBalanced: z.boolean(),
    })
    .optional(),
  incomeStatement: z
    .object({
      revenuesTotal: z.number(),
      chargesTotal: z.number(),
      netResult: z.number(),
    })
    .optional(),
});

/** POST /agents/cloture/ask — specialized continuous closing agent (CO 957-963) */
agentsRouter.post("/cloture/ask", requireAuth, async (req, res) => {
  const parsed = ClotureAskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await clotureAgent.ask(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("Cloture agent error:", err);
    res.status(500).json({ error: "cloture agent failed", message: (err as Error).message });
  }
});

/** GET /agents — list of available agents */
agentsRouter.get("/", (_req, res) => {
  res.json({
    agents: [
      {
        id: "classifier",
        endpoint: "POST /rag/classify",
        model: "lexa-classifier",
        description: "Classifie une transaction bancaire en compte Käfer + TVA + citations",
      },
      {
        id: "reasoning",
        endpoint: "POST /rag/ask",
        model: "lexa-reasoning",
        description: "Repond a une question juridique/fiscale generale avec citations legales",
      },
      {
        id: "tva",
        endpoint: "POST /agents/tva/ask",
        model: "lexa-tva",
        description: "Agent specialise TVA (LTVA, OLTVA, Info TVA) pour questions complexes",
      },
      {
        id: "fiscal-pp-vs",
        endpoint: "POST /agents/fiscal-pp/ask",
        model: "lexa-fiscal-pp-vs",
        description:
          "Agent specialise fiscalite PP Valais (LIFD, LHID, LF VS, Guide PP 2024)",
      },
      {
        id: "fiscal-pp-ge",
        endpoint: "POST /agents/fiscal-pp-ge/ask",
        model: "lexa-fiscal-pp-ge",
        description:
          "Agent specialise fiscalite PP Geneve (LIFD, LHID, LIPP, LCP, LIPM)",
      },
      {
        id: "fiscal-pp-vd",
        endpoint: "POST /agents/fiscal-pp-vd/ask",
        model: "lexa-fiscal-pp-vd",
        description:
          "Agent specialise fiscalite PP Vaud (LIFD, LHID, LI VD, LIPC VD)",
      },
      {
        id: "fiscal-pp-fr",
        endpoint: "POST /agents/fiscal-pp-fr/ask",
        model: "lexa-fiscal-pp-fr",
        description:
          "Agent specialise fiscalite PP Fribourg (LIFD, LHID, LICD FR, LIC FR, ORD-FP FR)",
      },
      {
        id: "fiscal-pp-ne",
        endpoint: "POST /agents/fiscal-pp-ne/ask",
        model: "lexa-fiscal-pp-ne",
        description:
          "Agent specialise fiscalite PP Neuchatel (LIFD, LHID, LCdir NE, RGI NE, ORD-FP NE)",
      },
      {
        id: "fiscal-pp-ju",
        endpoint: "POST /agents/fiscal-pp-ju/ask",
        model: "lexa-fiscal-pp-ju",
        description:
          "Agent specialise fiscalite PP Jura (LIFD, LHID, LI JU RSJU 641.11)",
      },
      {
        id: "fiscal-pp-bj",
        endpoint: "POST /agents/fiscal-pp-bj/ask",
        model: "lexa-fiscal-pp-bj",
        description:
          "Agent specialise fiscalite PP Jura bernois (LIFD, LHID, LI BE RSB 661.11, OI BE RSB 661.111)",
      },
      {
        id: "fiscal-pm",
        endpoint: "POST /agents/fiscal-pm/ask",
        model: "lexa-fiscal-pm",
        description:
          "Agent specialise fiscalite PM Sarl/SA (LIFD art.57-79, CO art.957-963b, LHID art.24-31, lois cantonales PM)",
      },
      {
        id: "cloture",
        endpoint: "POST /agents/cloture/ask",
        model: "lexa-cloture",
        description:
          "Agent cloture continue CO 957-963 — bilan+resultat projection temps reel + detection ecritures manquantes",
      },
    ],
    planned: [
      { id: "conseiller", description: "Optimisation proactive" },
      { id: "audit", description: "Audit trail + vérification cohérence" },
    ],
  });
});
