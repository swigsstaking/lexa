import { Router } from "express";
import { z } from "zod";
import { lexaAgent } from "../agents/lexa/LexaAgent.js";
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
import { auditAgent } from "../agents/audit/AuditAgent.js";
import { conseillerAgent } from "../agents/conseiller/ConseillerAgent.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { enqueueLlmCall, registerLlmHandler } from "../services/LlmQueue.js";
import { handleLlmError } from "./_llmErrorHandler.js";

// ── Register all agent handlers (no circular imports — agents imported here) ──

registerLlmHandler("lexa", (p) => lexaAgent.ask(p as Parameters<typeof lexaAgent.ask>[0]));
registerLlmHandler("tva", (p) => tvaAgent.ask(p as Parameters<typeof tvaAgent.ask>[0]));
registerLlmHandler("fiscal-pp-vs", (p) => fiscalPpVsAgent.ask(p as Parameters<typeof fiscalPpVsAgent.ask>[0]));
registerLlmHandler("fiscal-pp-ge", (p) => fiscalPpGeAgent.ask(p as Parameters<typeof fiscalPpGeAgent.ask>[0]));
registerLlmHandler("fiscal-pp-vd", (p) => fiscalPpVdAgent.ask(p as Parameters<typeof fiscalPpVdAgent.ask>[0]));
registerLlmHandler("fiscal-pp-fr", (p) => fiscalPpFrAgent.ask(p as Parameters<typeof fiscalPpFrAgent.ask>[0]));
registerLlmHandler("fiscal-pp-ne", (p) => fiscalPpNeAgent.ask(p as Parameters<typeof fiscalPpNeAgent.ask>[0]));
registerLlmHandler("fiscal-pp-ju", (p) => fiscalPpJuAgent.ask(p as Parameters<typeof fiscalPpJuAgent.ask>[0]));
registerLlmHandler("fiscal-pp-bj", (p) => fiscalPpBjAgent.ask(p as Parameters<typeof fiscalPpBjAgent.ask>[0]));
registerLlmHandler("fiscal-pm", (p) => fiscalPmAgent.ask(p as Parameters<typeof fiscalPmAgent.ask>[0]));
registerLlmHandler("cloture", (p) => clotureAgent.ask(p as Parameters<typeof clotureAgent.ask>[0]));
registerLlmHandler("audit", (p) => auditAgent.ask(p as Parameters<typeof auditAgent.ask>[0]));
registerLlmHandler("conseiller", (p) => conseillerAgent.ask(p as Parameters<typeof conseillerAgent.ask>[0]));

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
    const result = await enqueueLlmCall(req.tenantId, "tva", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("TVA agent error:", err);
    handleLlmError(err, res, "TVA");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pp-vs", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpVs agent error:", err);
    handleLlmError(err, res, "Fiscal PP VS");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pp-ge", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpGe agent error:", err);
    handleLlmError(err, res, "Fiscal PP GE");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pp-vd", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpVd agent error:", err);
    handleLlmError(err, res, "Fiscal PP VD");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pp-fr", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpFr agent error:", err);
    handleLlmError(err, res, "Fiscal PP FR");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pp-ne", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpNe agent error:", err);
    handleLlmError(err, res, "Fiscal PP NE");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pp-ju", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpJu agent error:", err);
    handleLlmError(err, res, "Fiscal PP JU");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pp-bj", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPpBj agent error:", err);
    handleLlmError(err, res, "Fiscal PP BJ");
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
    const result = await enqueueLlmCall(req.tenantId, "fiscal-pm", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("FiscalPm agent error:", err);
    handleLlmError(err, res, "Fiscal PM");
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
    const result = await enqueueLlmCall(req.tenantId, "cloture", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("Cloture agent error:", err);
    handleLlmError(err, res, "Clôture");
  }
});

const AuditAskSchema = z.object({
  question: z.string().min(3).max(2000),
  year: z.number().int().optional(),
  context: z
    .object({
      recentDecisions: z
        .array(
          z.object({
            agent: z.string(),
            confidence: z.number(),
            citations: z.array(
              z.object({ law: z.string(), article: z.string() }),
            ),
          }),
        )
        .optional(),
    })
    .optional(),
});

/** POST /agents/audit/ask — Audit agent (CO 958f, LTVA 70, nLPD) — vérif citations + intégrité IA */
agentsRouter.post("/audit/ask", requireAuth, async (req, res) => {
  const parsed = AuditAskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await enqueueLlmCall(req.tenantId, "audit", parsed.data);
    res.json(result);
  } catch (err) {
    console.error("Audit agent error:", err);
    handleLlmError(err, res, "Audit");
  }
});

const ConseillerAskSchema = z.object({
  question: z.string().min(3).max(2000),
  year: z.number().int().optional(),
  context: z
    .object({
      canton: z.enum(["VS", "GE", "VD", "FR"]).optional(),
      entityType: z.enum(["pp", "pm"]).optional(),
      civilStatus: z.enum(["single", "married"]).optional(),
      currentIncome: z.number().optional(),
      companyProfit: z.number().optional(),
    })
    .optional(),
});

/** POST /agents/conseiller/ask — Agent conseiller optimisation fiscale proactive (LIFD art.33+58+62+68, LHID art.24-31) */
agentsRouter.post("/conseiller/ask", requireAuth, async (req, res) => {
  const parsed = ConseillerAskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }
  try {
    const result = await enqueueLlmCall(req.tenantId, "conseiller", parsed.data);
    res.json(result);
  } catch (err) {
    handleLlmError(err, res, "Conseiller");
  }
});

const LexaAskSchema = z.object({
  question: z.string().min(3).max(2000),
  tenantId: z.string().uuid(),
  year: z.number().int().optional(),
});

/** POST /agents/lexa/ask — agent générique avec context injection comptable
 *  ?stream=true → SSE (text/event-stream), tokens streamés au fur et à mesure
 *  Sans ?stream   → JSON classique (comportement non-streaming préservé)
 */
agentsRouter.post("/lexa/ask", requireAuth, async (req, res) => {
  const parsed = LexaAskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const wantStream =
    req.query.stream === "true" ||
    req.query.stream === "1" ||
    req.headers.accept?.includes("text/event-stream");

  if (wantStream) {
    // ── Mode streaming SSE ──────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Désactive le buffering Nginx
    res.flushHeaders();

    try {
      for await (const event of lexaAgent.askStream(parsed.data)) {
        if (event.type === "delta") {
          res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
        } else if (event.type === "done") {
          res.write(
            `data: ${JSON.stringify({
              done: true,
              citations: event.citations,
              durationMs: event.durationMs,
              model: event.model,
            })}\n\n`,
          );
        } else if (event.type === "error") {
          res.write(`data: ${JSON.stringify({ error: event.message })}\n\n`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  // ── Mode non-streaming (fallback, compat existante) ──────────────────────
  try {
    const result = await enqueueLlmCall(req.tenantId, "lexa", parsed.data);
    res.json(result);
  } catch (err) {
    handleLlmError(err, res, "Lexa");
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
        id: "lexa",
        endpoint: "POST /agents/lexa/ask",
        model: "lexa-reasoning",
        description: "Agent générique avec context injection comptable — repond aux questions sur le grand livre + règles fiscales",
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
      {
        id: "audit",
        endpoint: "POST /agents/audit/ask",
        model: "lexa-audit",
        description:
          "Agent audit — verification citations legales (CO 958f, LTVA 70) + detection hallucinations + audit trail immuable",
      },
      {
        id: "conseiller",
        endpoint: "POST /agents/conseiller/ask",
        model: "lexa-conseiller",
        description:
          "Agent conseiller optimisation fiscale proactive — simulations 'et si ?' + briefing quotidien (LIFD art.33+58+62+68, LHID art.24-31)",
      },
    ],
    planned: [],
  });
});
