/**
 * Client OCR Ollama — qwen3-vl-ocr pour le pipeline pp-import (P1.B.B1).
 *
 * Paramètres obligatoires (spec §6.2 + mémoire feedback_ia_perf_measurement.md) :
 *   think: false, num_predict: 8192, temperature: 0
 *
 * Pre-processing image : resize ≤900px + JPEG Q80 avant envoi Ollama (latence ÷4).
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
const VISION_MODEL = config.MODEL_OCR; // "qwen3-vl-ocr"

// Params communs (spec §7 critère 7)
const OLLAMA_OPTIONS = {
  temperature: 0,
  num_predict: 8192,
} as const;

// ── Pre-processing image ──────────────────────────────────────────────────────

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 80;

/**
 * Redimensionne l'image si > 900px et encode en JPEG Q80.
 * Réduit la latence Ollama d'un facteur ~4 (spec §8 critère 8).
 */
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
    // Si le pre-processing échoue (ex: format non supporté), on retourne le buffer original
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

// ── Helper Ollama chat ────────────────────────────────────────────────────────

async function callOllamaVision(
  imageBase64: string,
  prompt: string,
  timeoutMs = 90_000,
): Promise<string> {
  const { data } = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
          images: [imageBase64],
        },
      ],
      stream: false,
      think: false,
      options: OLLAMA_OPTIONS,
    },
    { timeout: timeoutMs },
  );

  return (data.message?.content ?? "") as string;
}

function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// ── Classification vision ─────────────────────────────────────────────────────

/**
 * Classifie un document pour la catégorie "auto" (drag & drop universel).
 * Utilise qwen3-vl-ocr avec le prompt CLASSIFIER_PROMPT.
 */
export async function classifyDocument(imageBuffer: Buffer): Promise<ClassifyResult> {
  const preprocessed = await preprocessImage(imageBuffer);
  const base64 = preprocessed.toString("base64");

  const raw = await callOllamaVision(base64, CLASSIFIER_PROMPT);
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

/**
 * Extrait les champs structurés d'un document selon sa catégorie.
 * Pre-processing image appliqué avant envoi Ollama.
 */
export async function extractByCategory(
  imageBuffer: Buffer,
  category: ImportCategory,
): Promise<OcrExtractionResult> {
  const started = Date.now();

  const preprocessed = await preprocessImage(imageBuffer);
  const base64 = preprocessed.toString("base64");

  const prompt = getPromptForCategory(category);
  const raw = await callOllamaVision(base64, prompt, 90_000);
  const cleaned = cleanJsonResponse(raw);

  let rawExtraction: Record<string, unknown> = {};
  let confidence = 0.7;

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    // Extraire le champ "confidence" s'il est présent dans la réponse
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
