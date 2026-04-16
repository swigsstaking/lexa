/**
 * QrFactureParser — Parser du QR-facture suisse (Swiss QR-bill ISO 20022)
 * + scanner QR code depuis buffer PNG/JPEG.
 *
 * Standard : https://www.paymentstandards.ch/
 * Spec : Swiss Payment Standards 2022 — Implementation Guidelines QR-bill v2.2
 *
 * Le QR code sur les factures suisses depuis 2019 contient 32+ champs fixes
 * encodés en lignes séparées par \r\n ou \n.
 *
 * Mapping des lignes (0-indexed) selon spec section 4.3 :
 *   0  : qrType   "SPC"
 *   1  : version  "0200"
 *   2  : coding   "1" (UTF-8)
 *   3  : iban     CH...
 *   4  : creditor.addressType  "S" | "K"
 *   5  : creditor.name
 *   6  : creditor.street (ou adresse ligne 1 si K)
 *   7  : creditor.buildingNumber (ou adresse ligne 2 si K)
 *   8  : creditor.postalCode
 *   9  : creditor.city
 *   10 : creditor.country
 *   11 : ultimateCreditor.addressType (généralement vide)
 *   12 : ultimateCreditor.name
 *   13 : ultimateCreditor.street
 *   14 : ultimateCreditor.buildingNumber
 *   15 : ultimateCreditor.postalCode
 *   16 : ultimateCreditor.city
 *   17 : ultimateCreditor.country
 *   18 : amount (vide si à saisir)
 *   19 : currency  "CHF" | "EUR"
 *   20 : debtor.addressType
 *   21 : debtor.name
 *   22 : debtor.street
 *   23 : debtor.buildingNumber
 *   24 : debtor.postalCode
 *   25 : debtor.city
 *   26 : debtor.country
 *   27 : referenceType  "QRR" | "SCOR" | "NON"
 *   28 : reference
 *   29 : unstructuredMessage
 *   30 : trailer  "EPD"
 *   31 : billInformation (optionnel)
 *   32+: alternativeSchemes (optionnel)
 *
 * Session Lane J — 2026-04-16
 */

import { createCanvas, Image } from "@napi-rs/canvas";
import jsQR from "jsqr";

export type QrBillAddress = {
  addressType: "S" | "K"; // S = structured, K = combined
  name: string;
  street?: string;        // ou adresse ligne 1 pour type K
  buildingNumber?: string; // ou adresse ligne 2 pour type K
  postalCode?: string;
  city?: string;
  country: string;        // ISO 3166-1 alpha-2 (ex: "CH")
};

export type SwissQrBill = {
  qrType: "SPC";
  version: string;        // "0200"
  coding: string;         // "1" = UTF-8
  iban: string;           // IBAN ou QR-IBAN (CH...)
  creditor: QrBillAddress;
  ultimateCreditor?: QrBillAddress;
  amount?: number;        // undefined si à saisir par le payeur
  currency: "CHF" | "EUR";
  debtor?: QrBillAddress;
  referenceType: "QRR" | "SCOR" | "NON";
  reference?: string;     // 27 chars pour QRR, alphanum pour SCOR
  unstructuredMessage?: string;
  trailer: "EPD";         // "End Payment Data"
  billInformation?: string; // // S1/... structured billing info
  alternativeSchemes?: string[]; // AV1/AV2 (ex: eBill)
};

/**
 * Parse une adresse depuis les lignes du QR code (5 lignes).
 * Retourne undefined si toutes les lignes pertinentes sont vides.
 */
function parseAddress(lines: string[], offset: number): QrBillAddress | undefined {
  const addressType = lines[offset]?.trim();
  const name = lines[offset + 1]?.trim();

  // Une adresse n'est valide que si elle a au moins un nom
  if (!name) return undefined;

  return {
    addressType: (addressType === "K" ? "K" : "S") as "S" | "K",
    name,
    street: lines[offset + 2]?.trim() || undefined,
    buildingNumber: lines[offset + 3]?.trim() || undefined,
    postalCode: lines[offset + 4]?.trim() || undefined,
    city: lines[offset + 5]?.trim() || undefined,
    country: lines[offset + 6]?.trim() || "CH",
  };
}

/**
 * Parse une chaîne de contenu QR-facture suisse en structure SwissQrBill.
 *
 * Retourne null si la chaîne n'est pas un QR-facture valide (header != "SPC"
 * ou nombre de lignes insuffisant).
 *
 * @param qrContent - Contenu brut du QR code (lignes séparées par \r\n ou \n)
 */
export function parseQrBillString(qrContent: string): SwissQrBill | null {
  // Normalise les fins de ligne (CRLF ou LF)
  const lines = qrContent.split(/\r?\n/);

  // Validation header obligatoire
  if (lines[0]?.trim() !== "SPC") return null;
  // Version 02xx uniquement (standard actuel)
  if (!lines[1]?.startsWith("02")) return null;
  // Minimum 31 lignes (lignes 0-30 + EPD)
  if (lines.length < 31) return null;

  // Creditor (lignes 4-10, 7 valeurs)
  const creditor = parseAddress(lines, 4);
  if (!creditor) return null; // Créancier obligatoire

  // Ultimate creditor (lignes 11-17) — généralement vide en v0200
  const ultimateCreditor = parseAddress(lines, 11);

  // Montant (ligne 18) — vide = à saisir par le payeur
  const amountRaw = lines[18]?.trim();
  const amount = amountRaw ? parseFloat(amountRaw) : undefined;

  // Devise (ligne 19)
  const currencyRaw = lines[19]?.trim();
  const currency: "CHF" | "EUR" =
    currencyRaw === "EUR" ? "EUR" : "CHF";

  // Débiteur (lignes 20-26)
  const debtor = parseAddress(lines, 20);

  // Type de référence (ligne 27)
  const refTypeRaw = lines[27]?.trim() as "QRR" | "SCOR" | "NON";
  const validRefTypes = new Set(["QRR", "SCOR", "NON"]);
  const referenceType: "QRR" | "SCOR" | "NON" = validRefTypes.has(refTypeRaw)
    ? refTypeRaw
    : "NON";

  // Référence (ligne 28)
  const reference = lines[28]?.trim() || undefined;

  // Message libre (ligne 29)
  const unstructuredMessage = lines[29]?.trim() || undefined;

  // Trailer (ligne 30) — doit être "EPD"
  const trailer = lines[30]?.trim();
  if (trailer !== "EPD") return null;

  // Informations de facturation (ligne 31, optionnel)
  const billInformation = lines[31]?.trim() || undefined;

  // Schémas alternatifs (lignes 32+, optionnel)
  const alternativeSchemes: string[] = [];
  for (let i = 32; i < lines.length; i++) {
    const scheme = lines[i]?.trim();
    if (scheme) alternativeSchemes.push(scheme);
  }

  return {
    qrType: "SPC",
    version: lines[1].trim(),
    coding: lines[2]?.trim() || "1",
    iban: lines[3]?.trim() || "",
    creditor,
    ...(ultimateCreditor ? { ultimateCreditor } : {}),
    ...(amount !== undefined && !isNaN(amount) ? { amount } : {}),
    currency,
    ...(debtor ? { debtor } : {}),
    referenceType,
    ...(reference ? { reference } : {}),
    ...(unstructuredMessage ? { unstructuredMessage } : {}),
    trailer: "EPD",
    ...(billInformation ? { billInformation } : {}),
    ...(alternativeSchemes.length > 0 ? { alternativeSchemes } : {}),
  };
}

/**
 * Scanne le contenu raw QR et retourne un SwissQrBill si le contenu
 * est un QR-facture suisse valide, null sinon.
 *
 * Alias pratique pour utilisation dans OcrExtractor.
 */
export function tryParseSwissQrBill(rawQrContent: string): SwissQrBill | null {
  try {
    return parseQrBillString(rawQrContent);
  } catch {
    return null;
  }
}

/**
 * Décode les QR codes présents dans un buffer PNG ou JPEG.
 *
 * Utilise jsQR (pur JS) + @napi-rs/canvas pour décoder le PNG en RGBA.
 * Retourne la première chaîne QR trouvée, ou null si aucun QR détecté.
 *
 * @param imageBuffer - Buffer PNG ou JPEG de l'image à scanner
 */
export async function scanQrFromImage(imageBuffer: Buffer): Promise<string | null> {
  // Charger l'image via @napi-rs/canvas (déjà présent dans le projet S25)
  const img = new Image();
  img.src = imageBuffer;

  // Créer un canvas de la taille de l'image
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // Extraire les données RGBA brutes (ImageData)
  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  // Lancer jsQR sur les données RGBA
  const code = jsQR(imageData.data, img.width, img.height, {
    inversionAttempts: "attemptBoth",
  });

  return code?.data ?? null;
}

/**
 * Scanne un buffer image et tente de parser un QR-facture suisse.
 * Retourne null si aucun QR trouvé ou si ce n'est pas un QR-facture.
 *
 * Pipeline complet : image → QR decode → parse SPC → SwissQrBill
 */
export async function scanAndParseQrBill(imageBuffer: Buffer): Promise<SwissQrBill | null> {
  try {
    const rawQr = await scanQrFromImage(imageBuffer);
    if (!rawQr) return null;
    return parseQrBillString(rawQr);
  } catch {
    return null;
  }
}
