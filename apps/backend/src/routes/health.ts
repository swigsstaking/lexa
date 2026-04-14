import { Router } from "express";
import { pool } from "../db/postgres.js";
import { embedder } from "../rag/EmbedderClient.js";
import { qdrant } from "../rag/QdrantClient.js";
import { ollama } from "../llm/OllamaClient.js";
import { config } from "../config/index.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const [pgOk, qdrantOk, ollamaOk, embedderOk] = await Promise.all([
    pool
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false),
    qdrant.health(),
    ollama.health(),
    embedder.health(),
  ]);

  const points = qdrantOk ? await qdrant.countPoints().catch(() => -1) : -1;

  const ok = pgOk && qdrantOk && ollamaOk;

  res.status(ok ? 200 : 503).json({
    ok,
    version: "0.1.0",
    env: config.NODE_ENV,
    services: {
      postgres: pgOk,
      qdrant: qdrantOk,
      qdrantPoints: points,
      ollama: ollamaOk,
      embedder: embedderOk,
    },
  });
});
