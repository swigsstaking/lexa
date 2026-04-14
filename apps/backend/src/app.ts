import express from "express";
import { config } from "./config/index.js";
import { tenantMiddleware } from "./middleware/tenant.js";
import { healthRouter } from "./routes/health.js";
import { ragRouter } from "./routes/rag.js";
import { transactionsRouter } from "./routes/transactions.js";
import { ledgerRouter } from "./routes/ledger.js";
import { connectorsRouter } from "./routes/connectors.js";
import { agentsRouter } from "./routes/agents.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { formsRouter } from "./routes/forms.js";

const app = express();

app.use(express.json({ limit: "2mb" }));

// CORS — frontend dev server peut appeler le backend en direct avec X-Tenant-Id
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.header("Origin") ?? "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Tenant-Id, x-tenant-id",
  );
  res.header("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(tenantMiddleware);

// Routes
app.use(healthRouter);
app.use("/rag", ragRouter);
app.use("/transactions", transactionsRouter);
app.use("/ledger", ledgerRouter);
app.use("/connectors", connectorsRouter);
app.use("/agents", agentsRouter);
app.use("/onboarding", onboardingRouter);
app.use("/forms", formsRouter);

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
