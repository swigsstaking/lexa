import { Router } from "express";
import { z } from "zod";
import { ragQuery } from "../rag/ragQuery.js";
import { classifierAgent } from "../agents/classifier/ClassifierAgent.js";

export const ragRouter = Router();

const AskSchema = z.object({
  question: z.string().min(3).max(2000),
  topK: z.number().int().positive().max(20).optional(),
});

ragRouter.post("/ask", async (req, res) => {
  const parsed = AskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  try {
    const answer = await ragQuery(parsed.data);
    res.json(answer);
  } catch (err) {
    console.error("RAG error:", err);
    res.status(500).json({ error: "rag failed", message: (err as Error).message });
  }
});

const ClassifySchema = z.object({
  date: z.string(),
  description: z.string().min(3).max(500),
  amount: z.number(),
  currency: z.string().length(3).default("CHF"),
  counterpartyIban: z.string().optional(),
});

ragRouter.post("/classify", async (req, res) => {
  const parsed = ClassifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  try {
    const result = await classifierAgent.classify(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("Classify error:", err);
    res.status(500).json({ error: "classify failed", message: (err as Error).message });
  }
});
