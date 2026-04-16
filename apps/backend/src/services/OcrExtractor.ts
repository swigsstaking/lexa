/**
 * OcrExtractor — Pipeline OCR 2-stages pour documents fiscaux suisses.
 *
 * Stage 1 : Extraction texte brut
 *   - PDF avec texte embarqué → pdf-parse (rapide, fiable)
 *   - PDF scanné / pdfkit / texte court → conversion PNG via pdfjs-dist + @napi-rs/canvas
 *     puis qwen3-vl-ocr via Ollama (vision model)
 *   - Image (JPEG/PNG) → direct qwen3-vl-ocr via Ollama
 *
 * Stage 2 : Classification + extraction champs structurés
 *   - qwen3.5:9b-optimized via Ollama (format JSON strict)
 *
 * Session 23 — pipeline OCR initial.
 * Session 25 — fix: PDF → PNG via pdfjs-dist + @napi-rs/canvas (plus de pdftoppm requis)
 *              Corrige bug "bad XRef entry" (pdfkit) + bug "Ollama 500 sur PDF brut".
 */

import pdfParse from "pdf-parse";
import axios from "axios";
import { createCanvas } from "@napi-rs/canvas";
import { config } from "../config/index.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanAndParseQrBill, type SwissQrBill } from "./QrFactureParser.js";

const OLLAMA_URL = config.OLLAMA_URL;
const VISION_MODEL = "qwen3-vl-ocr";
const STRUCTURE_MODEL = "qwen3.5:9b-optimized";

// Chemin vers les polices standard pdfjs-dist (résolu au runtime)
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Convertit la première page d'un PDF en PNG via pdfjs-dist + @napi-rs/canvas.
 * Solution pure Node.js — ne nécessite pas pdftoppm/poppler système.
 *
 * Corrige bug S23 :
 *  - pdf-parse@1.1.1 incompatible avec pdfkit (bad XRef entry)
 *  - Ollama rejette les PDF bruts en base64 avec HTTP 500
 */
async function pdfToPng(pdfBuffer: Buffer): Promise<Buffer> {
  // Import dynamique pour éviter l'initialisation ESM au top-level
  const { getDocument } = await import(
    /* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs" as string
  );

  // Chercher les polices standard dans node_modules pdfjs-dist
  // On cherche depuis le répertoire des sources OU node_modules
  let standardFontDataUrl: string | undefined;
  try {
    // Chercher pdfjs-dist dans node_modules relatif au projet
    const possiblePaths = [
      join(__dirname, "../../../node_modules/pdfjs-dist/standard_fonts/"),
      join(__dirname, "../../../../node_modules/pdfjs-dist/standard_fonts/"),
      "/home/swigs/lexa-backend/node_modules/pdfjs-dist/standard_fonts/",
    ];
    for (const p of possiblePaths) {
      try {
        const { existsSync } = await import("node:fs");
        if (existsSync(p)) {
          standardFontDataUrl = p;
          break;
        }
      } catch {
        // continuer
      }
    }
  } catch {
    // Sans fonts, il y a des warnings mais ça fonctionne quand même
  }

  const pdf = await (getDocument as CallableFunction)({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableWorker: true,
    ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
  }).promise;

  const page = await (pdf as { getPage: (n: number) => Promise<unknown> }).getPage(1);
  // Scale 2.0 ≈ 200 dpi — lisible pour l'OCR vision
  const viewport = (
    page as { getViewport: (opts: { scale: number }) => { width: number; height: number } }
  ).getViewport({ scale: 2.0 });

  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const context = canvas.getContext("2d");

  await (
    page as {
      render: (opts: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
    }
  ).render({ canvasContext: context, viewport }).promise;

  return canvas.toBuffer("image/png");
}

/**
 * Sérialise récursivement une valeur JSON en texte plat.
 * Utilisé par parseOcrModelOutput pour aplatir les JSON imbriqués de qwen3-vl-ocr.
 *
 * Exemple :
 *   { "Rémunération": { "Salaire brut": "CHF 85'000.00" } }
 *   → "Rémunération:\n  Salaire brut: CHF 85'000.00"
 */
function flattenJsonToText(obj: unknown, indent = 0): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => flattenJsonToText(item, indent)).join("\n");
  }

  if (typeof obj === "object") {
    const prefix = "  ".repeat(indent);
    return Object.entries(obj as Record<string, unknown>)
      .map(([k, v]) => {
        if (v === null || v === undefined || v === "") {
          return `${prefix}${k}`;
        }
        if (typeof v === "object") {
          return `${prefix}${k}:\n${flattenJsonToText(v, indent + 1)}`;
        }
        return `${prefix}${k}: ${String(v)}`;
      })
      .join("\n");
  }

  return String(obj);
}

/**
 * Parser robuste pour la sortie non-déterministe de qwen3-vl-ocr.
 * Gère les formats observés :
 *   1. {"text": "..."} — texte dans champ text
 *   2. {"text": [...]} — tableau de lignes dans champ text
 *   3. {"section": {"champ": "valeur"}} — JSON imbriqué (cas fréquent qwen3-vl-ocr)
 *   4. {"ligne1": "", "ligne2": ""} — clés = lignes OCR, valeurs vides
 *   5. Texte brut sans JSON
 *
 * Session 25 : ajout flattenJsonToText pour cas 3 (JSON imbriqué multi-niveaux).
 */
function parseOcrModelOutput(content: string): string {
  if (!content.trim()) return "";

  // Nettoyer les blocs markdown que certains modèles insèrent
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    // Cas 1 & 2 : {"text": ...}
    if ("text" in parsed) {
      if (Array.isArray(parsed.text)) {
        return (parsed.text as string[]).join("\n");
      }
      if (typeof parsed.text === "string") {
        return parsed.text;
      }
    }

    // Cas 3 & 4 : JSON arbitraire (imbriqué ou plat) → aplatir récursivement
    const keys = Object.keys(parsed);
    if (keys.length > 0) {
      return flattenJsonToText(parsed);
    }
  } catch {
    // Pas de JSON valide — retourner le contenu brut
  }

  return cleaned;
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
  qrBill?: SwissQrBill;
}> {
  // Stage 0.5 : scan QR code en parallèle (non-bloquant)
  // Détecte le QR-facture suisse avant même l'OCR textuel.
  // Pour un PDF, on a besoin du PNG — on le génère si nécessaire.
  let pngBufferForQr: Buffer | null = null;
  let qrBill: SwissQrBill | undefined;

  if (mimeType === "application/pdf") {
    // Path 1 : PDF avec texte embarqué (pdfkit/Word/LibreOffice avec embed)
    try {
      const parsed = await pdfParse(buffer);
      if (parsed.text?.trim().length > 50) {
        console.log("[ocr] pdf-parse: text extracted, length:", parsed.text.trim().length);
        // Pour le scan QR, on convertit quand même en PNG (en parallèle si possible)
        try {
          pngBufferForQr = await pdfToPng(buffer);
        } catch {
          // Non-bloquant — le scan QR est best-effort
        }
        // Scan QR sur le PNG si dispo
        if (pngBufferForQr) {
          try {
            const detected = await scanAndParseQrBill(pngBufferForQr);
            if (detected) {
              console.log("[ocr] QR-facture detected (pdf-parse path):", detected.iban);
              qrBill = detected;
            }
          } catch (err) {
            console.warn("[ocr] QR scan failed (non-blocking):", (err as Error).message);
          }
        }
        return { text: parsed.text, method: "pdf-parse", confidence: 0.95, qrBill };
      }
      console.log("[ocr] pdf-parse: text too short (<50 chars), will convert to PNG");
    } catch (err) {
      // Bug S23 : pdf-parse@1.1.1 incompatible avec pdfkit → "bad XRef entry"
      // Solution : convertir le PDF en PNG via pdfjs-dist + @napi-rs/canvas
      console.warn(
        "[ocr] pdf-parse failed (probably pdfkit-generated PDF), converting to PNG:",
        (err as Error).message,
      );
    }

    // Path 2 : PDF scanné OU pdfkit OU texte trop court → convertir en PNG
    console.log("[ocr] converting PDF to PNG via pdfjs-dist...");
    buffer = await pdfToPng(buffer);
    pngBufferForQr = buffer;
    mimeType = "image/png";
    console.log("[ocr] PDF→PNG conversion done, PNG size:", buffer.length, "bytes");
  } else if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/jpg") {
    // Image directe : scanner le QR maintenant
    pngBufferForQr = buffer;
  }

  // Scan QR sur le PNG / image directe (si pas encore fait)
  if (pngBufferForQr && !qrBill) {
    try {
      const detected = await scanAndParseQrBill(pngBufferForQr);
      if (detected) {
        console.log("[ocr] QR-facture detected:", detected.iban);
        qrBill = detected;
      }
    } catch (err) {
      console.warn("[ocr] QR scan failed (non-blocking):", (err as Error).message);
    }
  }

  // Image directe (JPEG/PNG) ou PNG issu du preprocessing PDF
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
  // method = "qwen3-vl-ocr" qu'on soit passé par une image directe ou via PDF→PNG preprocessing
  return { text: parsedText, method: "qwen3-vl-ocr", confidence: 0.85, qrBill };
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

- certificat_salaire : Pour un certificat de salaire suisse, utilise la nomenclature Swissdec officielle.
  Les cases numérotées 1-15 sont normées dans le Lohnausweis. Extrait-les précisément si présentes :
  - Case 1 : Salaire annuel brut soumis AVS (case1_salaireBrut, number CHF)
  - Case 7 : Autres prestations périodiques — 13ème, bonus, gratifications (case7_autresPrestations, number CHF)
  - Case 8 : Total salaire brut (case8_totalBrut, number CHF)
  - Case 9 : Cotisations sociales employé AVS/AI/APG/AC (case9_cotisationsSociales, number CHF)
  - Case 10 : Cotisations LPP ordinaires employé (case10_lppOrdinaire, number CHF)
  - Case 11 : Rachats LPP volontaires (case11_lppRachats, number CHF)
  - Case 12 : Autres déductions (case12_autresDeductions, number CHF)
  - Case 13 : Frais effectifs remboursés (case13_fraisEffectifs, number CHF)
  - Case 14 : Prestations non soumises AVS (case14_prestationsNonSoumises, number CHF)
  - Case 15 : Remarques (case15_remarques, string)
  Inclure aussi les champs généraux : employer (string), employeeName (string), year (number), period (string)
  Inclure les agrégats legacy pour compatibilité : grossSalary (= case8_totalBrut ou case1_salaireBrut, number CHF), netSalary (number CHF), avsLpp (= case9 + case10, number CHF)
  IMPORTANT : Si une case Swissdec n'est pas visible dans le document, omets-la (ne pas mettre 0 par défaut).
  Préfère les champs case* si les cases sont explicitement numérotées ; sinon utilise les champs legacy.

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

  // Si un QR-facture a été détecté, on force le type à "facture" et on
  // enrichit les extractedFields avec les données structurées du QR.
  let finalType = stage2.type;
  let finalFields = stage2.extractedFields;

  if (stage1.qrBill) {
    // Le QR-facture est une preuve certaine que c'est une facture
    if (finalType === "autre") {
      finalType = "facture";
    }
    // Merge qrBill dans extractedFields — le QR est prioritaire sur l'OCR
    // pour les champs financiers (IBAN, montant, référence)
    finalFields = {
      ...finalFields,
      qrBill: stage1.qrBill,
      // Surcharge les champs facture standard avec les données QR si disponibles
      ...(stage1.qrBill.iban ? { iban: stage1.qrBill.iban } : {}),
      ...(stage1.qrBill.amount !== undefined ? { amountTtc: stage1.qrBill.amount } : {}),
      ...(stage1.qrBill.reference ? { reference: stage1.qrBill.reference } : {}),
      ...(stage1.qrBill.creditor?.name ? { vendor: stage1.qrBill.creditor.name } : {}),
    };
  }

  return {
    rawText: stage1.text,
    extractionMethod: stage1.method,
    ocrConfidence: stage1.confidence,
    type: finalType,
    extractedFields: finalFields,
    durationMs: Date.now() - started,
  };
}
