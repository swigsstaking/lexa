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
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid config:", parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
