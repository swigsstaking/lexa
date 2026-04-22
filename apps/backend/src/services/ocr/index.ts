/**
 * Client OCR — pipeline pp-import (P1.B.B1).
 *
 * Backend vision par ordre de priorité :
 *   1. vLLM Qwen3-VL-8B-FP8 sur .103:8101 (OpenAI-compat, ~4-5s/doc en p95)
 *   2. Ollama qwen3-vl-ocr en fallback (~19s/doc, KV-cache forcé à 8192 pour
 *      cohabiter avec vLLM sur la même GPU)
 *
 * Bench 2026-04-22 (20 docs synthétiques) :
 *   vLLM  100 % accuracy, avg 4.8s, p95 5.2s
 *   Ollama 100 % accuracy, avg 19.0s, p95 28.8s
 *
 * Pre-processing image : resize ≤900px + JPEG Q80 (latence ÷ 4).
 */

import axios from "axios";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { config } from "../../config/index.js";
import {
  CLASSIFIER_PROMPT,
  CLASSIFIER_TYPE_MAP,
  getPromptForCategory,
  categoryToWizardStep,
  type ImportCategory,
} from "./prompts.js";

const OLLAMA_URL = config.OLLAMA_URL;
const OLLAMA_MODEL = config.MODEL_OCR; // "qwen3-vl-ocr"

// vLLM vision — Qwen3-VL-8B-Instruct-FP8 servi par avarok/dgx-vllm-nvfp4-kernel
const VLLM_VISION_URL = process.env.VLLM_VISION_URL ?? "http://192.168.110.103:8101";
const VLLM_VISION_MODEL = process.env.VLLM_VISION_MODEL ?? "Qwen/Qwen3-VL-8B-Instruct-FP8";
const USE_VLLM_OCR = process.env.USE_VLLM_OCR !== "false"; // par défaut ON depuis 2026-04-22

// Params communs pour les 2 backends
const MAX_TOKENS = 4096;

// Ollama options (fallback) — num_ctx forcé à 8192 car le modelfile qwen3-vl-ocr
// a par défaut 262144 ctx qui alloue 24 GB de KV-cache → OOM si vLLM déjà up.
const OLLAMA_OPTIONS = {
  temperature: 0,
  num_predict: MAX_TOKENS,
  num_ctx: 8192,
} as const;

// ── Pre-processing image ──────────────────────────────────────────────────────

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 80;

async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  try {
    const img = await loadImage(buffer);
    const { width, height } = img;

    let targetW = width;
    let targetH = height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      targetW = Math.round(width * ratio);
      targetH = Math.round(height * ratio);
    }

    const canvas = createCanvas(targetW, targetH);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetW, targetH);

    return canvas.toBuffer("image/jpeg", JPEG_QUALITY);
  } catch (err) {
    console.warn("[ocr] preprocessImage failed (non-fatal), using original:", (err as Error).message);
    return buffer;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClassifyResult = {
  category: ImportCategory;
  confidence: number;
};

export type OcrExtractionResult = {
  rawExtraction: Record<string, unknown>;
  confidence: number;
  category: ImportCategory;
  wizardStepTarget: string;
  durationMs: number;
};

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

async function callVllmVision(
  imageBase64: string,
  prompt: string,
  timeoutMs = 60_000,
): Promise<string> {
  const started = Date.now();
  const { data } = await axios.post(
    `${VLLM_VISION_URL}/v1/chat/completions`,
    {
      model: VLLM_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: MAX_TOKENS,
    },
    { timeout: timeoutMs },
  );

  const content = (data?.choices?.[0]?.message?.content ?? "") as string;
  const elapsed = Date.now() - started;
  console.log(`[ocr] vLLM ${VLLM_VISION_MODEL} — ${elapsed}ms, ${data?.usage?.completion_tokens ?? 0} tokens`);
  if (!content.trim()) {
    console.warn(`[ocr] callVllmVision empty content — usage=${JSON.stringify(data?.usage)}`);
  }
  return content;
}

async function callOllamaVision(
  imageBase64: string,
  prompt: string,
  timeoutMs = 180_000,
): Promise<string> {
  const { data } = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt, images: [imageBase64] }],
      stream: false,
      think: false,
      keep_alive: "30m",
      options: OLLAMA_OPTIONS,
    },
    { timeout: timeoutMs },
  );

  const content = (data.message?.content ?? "") as string;
  if (!content.trim()) {
    console.warn(
      `[ocr] callOllamaVision empty content — eval_count=${data.eval_count} done_reason=${data.done_reason}`,
    );
  }
  return content;
}

/**
 * Appelle vLLM en priorité ; fallback Ollama si vLLM down ou erreur.
 * Le feature flag USE_VLLM_OCR=false force Ollama (legacy).
 */
async function callVision(imageBase64: string, prompt: string): Promise<string> {
  if (USE_VLLM_OCR) {
    try {
      return await callVllmVision(imageBase64, prompt);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.warn(`[ocr] vLLM vision failed (${msg}), fallback to Ollama`);
      // fallthrough to Ollama
    }
  }
  return callOllamaVision(imageBase64, prompt);
}

function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// ── Classification vision ─────────────────────────────────────────────────────

export async function classifyDocument(imageBuffer: Buffer): Promise<ClassifyResult> {
  const preprocessed = await preprocessImage(imageBuffer);
  const base64 = preprocessed.toString("base64");

  const raw = await callVision(base64, CLASSIFIER_PROMPT);
  const cleaned = cleanJsonResponse(raw);

  try {
    const parsed = JSON.parse(cleaned) as { type?: string; confidence?: number };
    const category = CLASSIFIER_TYPE_MAP[parsed.type ?? "unknown"] ?? "auto";
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    return { category, confidence };
  } catch {
    console.warn("[ocr] classifyDocument JSON parse failed, raw:", cleaned.slice(0, 200));
    return { category: "auto", confidence: 0 };
  }
}

// ── Extraction OCR par catégorie ──────────────────────────────────────────────

export async function extractByCategory(
  imageBuffer: Buffer,
  category: ImportCategory,
): Promise<OcrExtractionResult> {
  const started = Date.now();

  const preprocessed = await preprocessImage(imageBuffer);
  const base64 = preprocessed.toString("base64");

  const prompt = getPromptForCategory(category);
  const raw = await callVision(base64, prompt);
  const cleaned = cleanJsonResponse(raw);

  let rawExtraction: Record<string, unknown> = {};
  let confidence = 0.7;

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed.confidence === "number") {
      confidence = parsed.confidence as number;
      delete parsed.confidence;
    }
    rawExtraction = parsed;
  } catch {
    console.warn("[ocr] extractByCategory JSON parse failed, raw:", cleaned.slice(0, 200));
    rawExtraction = { _raw: cleaned.slice(0, 2000) };
    confidence = 0.3;
  }

  return {
    rawExtraction,
    confidence,
    category,
    wizardStepTarget: categoryToWizardStep(category),
    durationMs: Date.now() - started,
  };
}
