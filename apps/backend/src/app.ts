import express from "express";
import { config } from "./config/index.js";
import { tenantMiddleware } from "./middleware/tenant.js";
import { healthRouter } from "./routes/health.js";
import { ragRouter } from "./routes/rag.js";
import { transactionsRouter } from "./routes/transactions.js";
import { ledgerRouter } from "./routes/ledger.js";
import { ledgerEditRouter } from "./routes/ledgerEdit.js";
import { connectorsRouter } from "./routes/connectors.js";
import { agentsRouter } from "./routes/agents.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { formsRouter } from "./routes/forms.js";
import { authRouter } from "./routes/auth.js";
import { taxpayersRouter } from "./routes/taxpayers.js";
import { companiesRouter } from "./routes/companies.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { noCache } from "./middleware/noCache.js";
import { documentsRouter } from "./routes/documents.js";
import { auditRouter } from "./routes/audit.js";
import { simulateRouter } from "./routes/simulate.js";
import { fiduciaryRouter } from "./routes/fiduciary.js";
import { jobsRouter } from "./routes/jobs.js";
import { connectMongo } from "./db/mongo.js";
import { conseillerRouter } from "./routes/conseiller.js";
import { startBriefingScheduler } from "./services/BriefingScheduler.js";
import { startImapListener } from "./services/ImapListener.js";
import { settingsRouter } from "./routes/settings.js";
import { bridgeRouter } from "./routes/bridge.js";
import { ppRouter } from "./routes/pp.js";
import { ppCryptoRouter } from "./routes/ppCrypto.js";

const app = express();

// Derrière nginx reverse proxy sur .59, faire confiance au premier hop pour
// X-Forwarded-For. Sans ça, express-rate-limit warn et compte toutes les
// requêtes comme venant de la même IP (l'IP loopback de nginx), ce qui
// détruit la protection bruteforce /auth/login.
app.set("trust proxy", 1);

// Capture le raw body pour la vérification HMAC du pont Pro→Lexa
// (requireHmac.ts lit req.rawBody avant que express.json ne consume le stream)
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);

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

// ── No-cache sur toutes les routes user-sensitive ──────
// Fix BUG-P1-01 : empêche la fuite de session via 304 Not Modified
// après logout+login d'un autre compte.
app.use((req, res, next) => {
  if (/^\/(fiduciary|taxpayers|companies|audit|documents|ledger|forms|agents|rag|simulate|jobs|pp)/.test(req.path)) {
    noCache(req, res, next);
  } else {
    next();
  }
});

// ── Public routes (pas d'auth) ─────────────────────────
app.use(healthRouter);
app.use("/auth", authRouter);
app.use("/onboarding", onboardingRouter);
app.use("/connectors", connectorsRouter); // HMAC validé côté routeur
app.use("/bridge", bridgeRouter);        // Pont bidirectionnel Swigs Pro → Lexa (Phase 3 V1.2)

// ── Routes protégées par requireAuth ────────────────────
// Session 14 : v1 single-user. Tenant extrait du JWT, pas du header.
app.use("/rag", requireAuth, ragRouter);
app.use("/transactions", requireAuth, transactionsRouter);
app.use("/ledger", requireAuth, ledgerRouter);
app.use("/ledger", requireAuth, ledgerEditRouter);
app.use("/forms", requireAuth, formsRouter);
app.use("/taxpayers", requireAuth, taxpayersRouter);
app.use("/companies", requireAuth, companiesRouter);
app.use("/documents", requireAuth, documentsRouter);

// /agents est mixte : GET / (listing) public, POST /* protégé via les
// handlers eux-mêmes dans routes/agents.ts.
app.use("/agents", agentsRouter);
app.use("/audit", requireAuth, auditRouter);
app.use("/simulate", requireAuth, simulateRouter);
app.use("/fiduciary", fiduciaryRouter); // requireAuth géré dans le routeur
app.use("/jobs", jobsRouter); // LLM queue job status (session 37)
app.use("/conseiller", conseillerRouter); // Briefings quotidiens (session briefing)
app.use("/settings", requireAuth, settingsRouter); // Paramètres tenant (email forward...)
app.use("/pp", requireAuth, ppRouter);
app.use("/pp/crypto", requireAuth, ppCryptoRouter);

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
  // MongoDB — non-bloquant, Lexa continue à démarrer même si Mongo est down
  connectMongo().catch((err) => {
    console.warn("[mongo] startup connection failed (non-fatal):", err.message);
  });
  // BriefingScheduler — cron 06:00 daily, fail graceful si Redis down
  startBriefingScheduler().catch((err) => {
    console.warn("[briefings] startup failed (non-fatal):", (err as Error).message);
  });
  // ImapListener — poll mail@swigs.online toutes les 5min (désactivé si IMAP_HOST absent)
  startImapListener();
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
