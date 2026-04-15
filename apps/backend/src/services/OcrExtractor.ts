/**
 * OcrExtractor — Pipeline OCR 2-stages pour documents fiscaux suisses.
 *
 * Stage 1 : Extraction texte brut
 *   - PDF avec texte embarqué → pdf-parse (rapide, fiable)
 *   - Image (JPEG/PNG) ou PDF scanné → qwen3-vl-ocr via Ollama (vision model)
 *
 * Stage 2 : Classification + extraction champs structurés
 *   - qwen3.5:9b-optimized via Ollama (format JSON strict)
 *
 * Session 23 — pipeline OCR initial.
 */

import pdfParse from "pdf-parse";
import axios from "axios";
import { config } from "../config/index.js";

const OLLAMA_URL = config.OLLAMA_URL;
const VISION_MODEL = "qwen3-vl-ocr";
const STRUCTURE_MODEL = "qwen3.5:9b-optimized";

/**
 * Parser robuste pour la sortie non-déterministe de qwen3-vl-ocr.
 * Gère les formats observés :
 *   1. {"text": "..."} — texte dans champ text
 *   2. {"text": [...]} — tableau de lignes dans champ text
 *   3. {"ligne1": "", "ligne2": ""} — clés = lignes OCR, valeurs vides
 *   4. Texte brut sans JSON
 */
function parseOcrModelOutput(content: string): string {
  if (!content.trim()) return "";

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Cas 1 & 2 : {"text": ...}
    if ("text" in parsed) {
      if (Array.isArray(parsed.text)) {
        return (parsed.text as string[]).join("\n");
      }
      if (typeof parsed.text === "string") {
        return parsed.text;
      }
    }

    // Cas 3 : {"ligne1": "", "ligne2": ""} — toutes les clés = lignes OCR
    const keys = Object.keys(parsed);
    if (keys.length > 0) {
      // Vérifier que les valeurs sont toutes vides ou courtes (c'est du format OCR-clés)
      const allValuesEmpty = keys.every(
        (k) => parsed[k] === "" || parsed[k] === null || parsed[k] === undefined,
      );
      if (allValuesEmpty) {
        return keys.join("\n");
      }
      // Si les valeurs ont du contenu, concaténer clés + valeurs
      return keys.map((k) => `${k}: ${parsed[k] ?? ""}`).join("\n");
    }
  } catch {
    // Pas de JSON valide — retourner le contenu brut
  }

  return content;
}

export type DocumentType =
  | "certificat_salaire"
  | "attestation_3a"
  | "facture"
  | "releve_bancaire"
  | "autre";

export type OcrResult = {
  rawText: string;
  extractionMethod: "pdf-parse" | "qwen3-vl-ocr";
  ocrConfidence: number;
  type: DocumentType;
  extractedFields: Record<string, unknown>;
  durationMs: number;
};

// ── Stage 1 : extraction texte brut ──────────────────────────────────────────

async function extractRawText(
  buffer: Buffer,
  mimeType: string,
): Promise<{
  text: string;
  method: OcrResult["extractionMethod"];
  confidence: number;
}> {
  if (mimeType === "application/pdf") {
    try {
      const parsed = await pdfParse(buffer);
      if (parsed.text?.trim().length > 20) {
        return { text: parsed.text, method: "pdf-parse", confidence: 0.95 };
      }
      // Texte trop court → PDF scanné, fallback vision
      console.log("[ocr] pdf-parse: text too short, falling back to vision");
    } catch (err) {
      console.warn(
        "[ocr] pdf-parse failed, falling back to vision:",
        (err as Error).message,
      );
    }
  }

  // Image ou PDF scanné : qwen3-vl-ocr
  // IMPORTANT: images[] attend du base64 brut sans prefix "data:image/..."
  const base64 = buffer.toString("base64");
  const { data } = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content:
            "Extract all visible text from this document. Return only the raw text, preserve the structure, no commentary.",
          images: [base64],
        },
      ],
      stream: false,
      think: false,
      options: { temperature: 0.1 },
    },
    { timeout: 120_000 },
  );

  // qwen3-vl-ocr a un format de sortie non-déterministe :
  //   - {"text": "..."} ou {"text": [...]}
  //   - {"ligne1": "", "ligne2": ""} (clés = texte extrait, valeurs vides)
  //   - texte brut sans JSON
  const rawContent: string = data.message?.content ?? "";
  console.log("[ocr] qwen3-vl-ocr raw content length:", rawContent.length);

  const parsedText = parseOcrModelOutput(rawContent);
  return { text: parsedText, method: "qwen3-vl-ocr", confidence: 0.85 };
}

// ── Stage 2 : classification + structuration ─────────────────────────────────

async function structureDocument(rawText: string): Promise<{
  type: DocumentType;
  extractedFields: Record<string, unknown>;
}> {
  const prompt = `Tu es un expert en documents fiscaux suisses. Analyse le texte extrait d'un document et retourne un JSON strict avec :
- "type" : exactement un de ["certificat_salaire", "attestation_3a", "facture", "releve_bancaire", "autre"]
- "extractedFields" : les champs structurés selon le type détecté

Schémas attendus par type :
- certificat_salaire : { employer (string), employeeName (string), grossSalary (number CHF), netSalary (number CHF), year (number), period (string), avsLpp (number CHF) }
- attestation_3a : { institution (string), amount (number CHF), year (number), contributorName (string) }
- facture : { vendor (string), date (string YYYY-MM-DD), amountTtc (number CHF), amountHt (number CHF), tva (number CHF), iban (string), reference (string) }
- releve_bancaire : { bank (string), iban (string), period (string), transactionCount (number) }
- autre : { description (string, max 200 chars) }

Retourne UNIQUEMENT le JSON valide, sans markdown ni commentaire. Omets les champs absents du document.

Texte extrait :
${rawText.slice(0, 8000)}`;

  const { data } = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: STRUCTURE_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1 },
    },
    { timeout: 60_000 },
  );

  const content: string = data.message?.content ?? "{}";
  try {
    // Nettoyer les éventuels blocs markdown que certains modèles insèrent
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      type?: string;
      extractedFields?: Record<string, unknown>;
    };

    const validTypes: DocumentType[] = [
      "certificat_salaire",
      "attestation_3a",
      "facture",
      "releve_bancaire",
      "autre",
    ];
    const type = validTypes.includes(parsed.type as DocumentType)
      ? (parsed.type as DocumentType)
      : "autre";

    return {
      type,
      extractedFields: parsed.extractedFields ?? {},
    };
  } catch (err) {
    console.warn("[ocr] structureDocument JSON parse failed:", err);
    return {
      type: "autre",
      extractedFields: { description: rawText.slice(0, 200) },
    };
  }
}

// ── Export principal ──────────────────────────────────────────────────────────

export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrResult> {
  const started = Date.now();

  const stage1 = await extractRawText(buffer, mimeType);

  if (!stage1.text.trim()) {
    throw new Error("No text extracted from document");
  }

  const stage2 = await structureDocument(stage1.text);

  return {
    rawText: stage1.text,
    extractionMethod: stage1.method,
    ocrConfidence: stage1.confidence,
    type: stage2.type,
    extractedFields: stage2.extractedFields,
    durationMs: Date.now() - started,
  };
}
