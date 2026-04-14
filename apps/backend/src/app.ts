import express from "express";
import { config } from "./config/index.js";
import { healthRouter } from "./routes/health.js";
import { ragRouter } from "./routes/rag.js";
import { transactionsRouter } from "./routes/transactions.js";

const app = express();

app.use(express.json({ limit: "2mb" }));

// Routes
app.use(healthRouter);
app.use("/rag", ragRouter);
app.use("/transactions", transactionsRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

// Error handler
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "internal", message: err.message });
  },
);

const server = app.listen(config.PORT, () => {
  console.log(`Lexa backend listening on :${config.PORT} (${config.NODE_ENV})`);
  console.log(`  Postgres: ${config.DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`  Ollama:   ${config.OLLAMA_URL}`);
  console.log(`  Qdrant:   ${config.QDRANT_URL}`);
  console.log(`  Embedder: ${config.EMBEDDER_URL}`);
});

// Graceful shutdown
const shutdown = async (signal: string): Promise<void> => {
  console.log(`\nReceived ${signal}, shutting down...`);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Force exit after 10s");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
