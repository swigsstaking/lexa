/**
 * elmParser.ts — Parser Swissdec ELM 5.0 (QR-code + XML)
 *
 * Extrait le QR-code depuis un PDF ou une image, décode le base64,
 * parse le XML ELM Swissdec, et retourne une SalaryExtraction structurée.
 *
 * Pipeline :
 *   filePath (PDF/PNG/JPEG)
 *     → extraction texte PDF ou buffer image
 *     → scan QR-code (jsQR via @napi-rs/canvas)
 *     → décodage base64 → XML
 *     → validation namespace ELM
 *     → parsing fast-xml-parser
 *     → mapping → SalaryExtraction (confidence = 1.0)
 *
 * Si pas de QR, XML invalide ou namespace inconnu → return null (fallback OCR).
 *
 * Spec : tasks/pp-import-modal-spec.md §8
 * Intégration : Agent B1 appelle trySwissdecELM(filePath) dans ocrProcess.ts
 */

import { readFile } from "fs/promises";
import { XMLParser } from "fast-xml-parser";
import { createCanvas, Image } from "@napi-rs/canvas";
import jsQR from "jsqr";

import { validateElmXml } from "./xsdValidator.js";
import { mapElmToSalaryExtraction } from "./mapping.js";
import type { SalaryExtraction } from "./mapping.js";

// ─── Types internes ───────────────────────────────────────────────────────────

/** Extensions de fichier supportées */
type SupportedExt = "pdf" | "png" | "jpeg" | "jpg";

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/** Détermine l'extension depuis le chemin */
function getFileExt(filePath: string): SupportedExt | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".jpeg") || lower.endsWith(".jpg")) return "jpeg";
  return null;
}

/**
 * Scanne un buffer image (PNG ou JPEG) à la recherche d'un QR-code.
 * Utilise jsQR sur les données RGBA via @napi-rs/canvas.
 * Retourne le contenu brut du QR ou null.
 */
async function scanQrFromImageBuffer(imageBuffer: Buffer): Promise<string | null> {
  try {
    const img = new Image();
    img.src = imageBuffer;

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const code = jsQR(imageData.data, img.width, img.height, {
      inversionAttempts: "attemptBoth",
    });

    return code?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Extrait les QR-codes depuis un PDF en rendant chaque page en image.
 * Utilise pdfjs-dist pour le rendu page par page.
 * Retourne le premier contenu QR trouvé, ou null.
 */
async function scanQrFromPdfBuffer(pdfBuffer: Buffer): Promise<string | null> {
  try {
    // Import dynamique pour éviter les problèmes de module ESM
    const pdfjsLib = await import("pdfjs-dist");

    const pdfData = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      // Désactive les warnings verbeux
      verbosity: 0,
    });
    const pdf = await loadingTask.promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x pour meilleure résolution QR

      // Créer un canvas napi pour rendu
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const ctx = canvas.getContext("2d");

      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code?.data) {
        return code.data;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Tente de décoder un contenu QR comme base64 → XML ELM.
 * Retourne le XML string si réussi, null sinon.
 *
 * Le QR du Lohnausweis Swissdec contient directement du base64
 * (pas de prefixe "data:..."). Si le contenu n'est pas du base64
 * valide ou ne décode pas en XML ELM, on retourne null.
 */
function decodeQrToXml(qrContent: string): string | null {
  if (!qrContent || qrContent.trim().length === 0) return null;

  // Cas 1 : Le QR contient directement du XML (sans encoding base64)
  const trimmed = qrContent.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<SalaryDeclaration")) {
    return trimmed;
  }

  // Cas 2 : Le QR contient du base64
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
    if (decoded.includes("SalaryDeclaration") || decoded.includes("Lohnausweis")) {
      return decoded;
    }
  } catch {
    // pas du base64 valide
  }

  return null;
}

/**
 * Configure fast-xml-parser pour le parsing ELM Swissdec.
 * Ignore les attributs xmlns pour simplifier l'accès aux éléments.
 */
function buildXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,        // supprime le préfixe de namespace (sd:Company → Company)
    parseTagValue: true,
    parseAttributeValue: true,
    trimValues: true,
    isArray: (tagName) => {
      // Ces éléments peuvent apparaître plusieurs fois
      return ["Person", "TaxSalary", "AHV-ALV-Salary", "BVG-LPP-Salary"].includes(tagName);
    },
  });
}

// ─── Export principal ─────────────────────────────────────────────────────────

/**
 * Tente de parser un Lohnausweis Swissdec ELM depuis un fichier.
 *
 * Étapes :
 * 1. Lit le fichier (PDF ou image)
 * 2. Extrait le QR-code (rendu page PDF ou scan image directe)
 * 3. Décode le base64 → XML
 * 4. Valide le namespace ELM
 * 5. Parse le XML → SalaryExtraction
 *
 * @param filePath - Chemin absolu vers le fichier PDF, PNG ou JPEG
 * @returns SalaryExtraction avec confidence = 1.0 si succès, null sinon
 */
export async function trySwissdecELM(filePath: string): Promise<SalaryExtraction | null> {
  const ext = getFileExt(filePath);
  if (!ext) return null;

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(filePath);
  } catch {
    return null;
  }

  // Étape 1 : Scan QR-code selon le type de fichier
  let qrContent: string | null = null;

  if (ext === "pdf") {
    qrContent = await scanQrFromPdfBuffer(fileBuffer);
  } else {
    // PNG ou JPEG : scan direct
    qrContent = await scanQrFromImageBuffer(fileBuffer);
  }

  if (!qrContent) return null;

  // Étape 2 : Décodage QR → XML
  const xmlContent = decodeQrToXml(qrContent);
  if (!xmlContent) return null;

  // Étape 3 : Validation namespace ELM
  const validation = validateElmXml(xmlContent);
  if (!validation.valid) return null;

  // Étape 4 : Parsing XML → objet JS
  const parser = buildXmlParser();
  let parsed: unknown;
  try {
    parsed = parser.parse(xmlContent);
  } catch {
    return null;
  }

  // Étape 5 : Mapping → SalaryExtraction
  const extraction = mapElmToSalaryExtraction(parsed as Parameters<typeof mapElmToSalaryExtraction>[0]);
  return extraction;
}

/**
 * Variante qui accepte directement un contenu XML string (sans fichier).
 * Utile pour les tests et pour l'intégration avec d'autres sources.
 *
 * @param xmlContent - Contenu XML ELM à parser
 * @returns SalaryExtraction ou null si invalide
 */
export function tryParseElmXml(xmlContent: string): SalaryExtraction | null {
  const validation = validateElmXml(xmlContent);
  if (!validation.valid) return null;

  const parser = buildXmlParser();
  let parsed: unknown;
  try {
    parsed = parser.parse(xmlContent);
  } catch {
    return null;
  }

  return mapElmToSalaryExtraction(parsed as Parameters<typeof mapElmToSalaryExtraction>[0]);
}

/**
 * Variante qui accepte directement un contenu QR string (base64 ou XML brut).
 * Utile pour les tests et l'intégration directe depuis un scanner QR.
 *
 * @param qrContent - Contenu brut du QR-code (base64 ou XML)
 * @returns SalaryExtraction ou null si invalide
 */
export function tryParseElmFromQr(qrContent: string): SalaryExtraction | null {
  const xmlContent = decodeQrToXml(qrContent);
  if (!xmlContent) return null;
  return tryParseElmXml(xmlContent);
}
