import { Router } from "express";
import { z } from "zod";
import { ragQuery } from "../rag/ragQuery.js";
import { classifierAgent } from "../agents/classifier/ClassifierAgent.js";
import { enqueueLlmCall, registerLlmHandler } from "../services/LlmQueue.js";
import { handleLlmError } from "./_llmErrorHandler.js";

// Register classify handler once at module load (no circular import — agent is imported here)
registerLlmHandler("classifier", (payload) =>
  classifierAgent.classify(payload as Parameters<typeof classifierAgent.classify>[0]),
);

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
    // ragQuery uses embedder + Ollama — goes through queue to avoid concurrent timeouts
    const answer = await enqueueLlmCall(
      req.tenantId ?? "public",
      "rag-ask",
      parsed.data,
    );
    res.json(answer);
  } catch (err) {
    handleLlmError(err, res, "RAG");
  }
});

// Register rag-ask handler
registerLlmHandler("rag-ask", (payload) =>
  ragQuery(payload as Parameters<typeof ragQuery>[0]),
);

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
    const result = await enqueueLlmCall(
      req.tenantId ?? "public",
      "classifier",
      parsed.data,
    );
    res.json(result);
  } catch (err) {
    handleLlmError(err, res, "Classifier");
  }
});
