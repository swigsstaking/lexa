/**
 * Gestion fichiers uploadés — stockage local /var/lexa/uploads/<tenant>/<id>.<ext>
 *
 * V1.3 : stockage local sur .59
 * Permissions : 0640 owner=swigs group=lexa
 * Purge : >90 jours + status committed → archive cold storage (V1.4)
 */

import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const UPLOADS_ROOT = process.env.UPLOADS_ROOT ?? "/var/lexa/uploads";
const ACCEPTED_MIMETYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIMETYPES)[number];

const MIME_TO_EXT: Record<AcceptedMimeType, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

/**
 * Vérifie si un MIME type est accepté.
 */
export function isAcceptedMimeType(mime: string): mime is AcceptedMimeType {
  return (ACCEPTED_MIMETYPES as readonly string[]).includes(mime);
}

/**
 * Retourne le chemin complet d'un fichier uploadé.
 */
export function getUploadPath(tenantId: string, importId: string, mimeType: AcceptedMimeType): string {
  const ext = MIME_TO_EXT[mimeType];
  return join(UPLOADS_ROOT, tenantId, `${importId}${ext}`);
}

/**
 * Sauvegarde un fichier uploadé sur disque.
 * Crée le répertoire tenant si nécessaire.
 * Applique permissions 0640 (spec §6.3).
 */
export async function saveUploadedFile(
  tenantId: string,
  importId: string,
  mimeType: AcceptedMimeType,
  buffer: Buffer,
): Promise<string> {
  const tenantDir = join(UPLOADS_ROOT, tenantId);
  await mkdir(tenantDir, { recursive: true, mode: 0o750 });

  const filePath = getUploadPath(tenantId, importId, mimeType);
  await writeFile(filePath, buffer, { mode: 0o640 });

  return filePath;
}

/**
 * Supprime un fichier uploadé (nettoyage ou erreur pipeline).
 * Non-bloquant si le fichier n'existe pas.
 */
export async function deleteUploadedFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn("[uploads] deleteUploadedFile failed:", (err as Error).message);
    }
  }
}

/**
 * Vérifie qu'un fichier existe et retourne sa taille.
 */
export async function getFileInfo(filePath: string): Promise<{ exists: boolean; sizeBytes: number }> {
  try {
    const s = await stat(filePath);
    return { exists: true, sizeBytes: s.size };
  } catch {
    return { exists: false, sizeBytes: 0 };
  }
}

/**
 * Retourne l'extension d'un chemin de fichier.
 */
export function getFileExtension(filePath: string): string {
  return extname(filePath).toLowerCase();
}
