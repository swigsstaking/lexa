import "dotenv/config";
import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3010),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://lexa_app:changeme@localhost:5432/lexa"),

  SPARK_HOST: z.string().default("192.168.110.103"),
  OLLAMA_URL: z.string().url().default("http://192.168.110.103:11434"),
  QDRANT_URL: z.string().url().default("http://192.168.110.103:6333"),
  EMBEDDER_URL: z.string().url().default("http://192.168.110.103:8001"),

  MODEL_CLASSIFIER: z.string().default("comptable-suisse-fast"),
  MODEL_REASONING: z.string().default("comptable-suisse"),
  MODEL_OCR: z.string().default("qwen3-vl-ocr"),

  QDRANT_COLLECTION: z.string().default("swiss_law"),
  RAG_TOP_K: z.coerce.number().int().positive().default(5),

  // Auth (session 14)
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 chars (use: openssl rand -hex 32)")
    .default("dev-only-jwt-secret-change-me-in-production-32chars"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  ADMIN_SECRET: z
    .string()
    .min(16, "ADMIN_SECRET must be at least 16 chars")
    .default("dev-admin-reset-secret-change-me"),

  // Webhook HMAC (session 14 bloc C)
  LEXA_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .default("dev-webhook-secret-change-me-in-production"),

  // Webhook retour Lexa→Pro (session 20)
  PRO_WEBHOOK_URL: z
    .string()
    .default("http://192.168.110.59:3003/api/integrations/lexa/webhook"),
  PRO_WEBHOOK_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // MongoDB GridFS pour stockage documents (session 23)
  MONGO_URL: z.string().default("mongodb://192.168.110.59:27017"),
  MONGO_DB: z.string().default("lexa-documents"),

  // Rate-limit auth login (configurable pour dev/qa, default conservateur en prod)
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid config:", parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
