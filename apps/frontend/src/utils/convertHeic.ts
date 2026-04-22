/**
 * Conversion HEIC/HEIF → JPEG côté client.
 *
 * iPhone produit du HEIC par défaut en 4K (~3-5 MB). Le backend OCR Lexa
 * (vLLM Qwen3-VL-8B-FP8 + Ollama fallback) accepte seulement PDF/JPEG/PNG.
 * On convertit donc en JPEG avant upload.
 *
 * heic2any : pure JS + WASM libheif (~57 KB gzipped). Fonctionne sur iOS
 * Safari, Chrome Android, Firefox desktop. Conversion ~2-3 s pour une
 * photo 4K sur iPhone récent.
 */

import heic2any from "heic2any";

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

export function isHeic(file: File): boolean {
  if (HEIC_MIME_TYPES.has(file.type)) return true;
  const ext = file.name.toLowerCase().split(".").pop();
  return !!ext && HEIC_EXTENSIONS.has(ext);
}

export type ConvertResult = {
  file: File;
  converted: boolean;
  durationMs: number;
};

/**
 * Si le fichier est HEIC/HEIF, le convertit en JPEG (quality 0.9).
 * Sinon retourne le fichier original inchangé.
 *
 * Le nom du fichier est préservé mais l'extension passe à .jpg.
 */
export async function ensureJpeg(file: File): Promise<ConvertResult> {
  if (!isHeic(file)) {
    return { file, converted: false, durationMs: 0 };
  }
  const started = performance.now();
  const blob = (await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  })) as Blob;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  const converted = new File([blob], newName, { type: "image/jpeg" });
  return {
    file: converted,
    converted: true,
    durationMs: Math.round(performance.now() - started),
  };
}
