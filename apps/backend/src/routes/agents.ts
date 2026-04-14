import { Router } from "express";
import { z } from "zod";
import { tvaAgent } from "../agents/tva/TvaAgent.js";

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
agentsRouter.post("/tva/ask", async (req, res) => {
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
    ],
    planned: [
      { id: "fiscal-pp", description: "Fiscal personnes physiques par canton" },
      { id: "fiscal-pm", description: "Fiscal personnes morales (SA/Sàrl)" },
      { id: "cloture", description: "Clôture continue CO" },
      { id: "conseiller", description: "Optimisation proactive" },
      { id: "audit", description: "Audit trail + vérification cohérence" },
    ],
  });
});
