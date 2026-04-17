/**
 * EmailRouter — Route les emails entrants vers le bon tenant via token.
 *
 * 2 stratégies de résolution du token :
 * - A. Subaddressing : to: mail+TOKEN@swigs.online  (RFC 5233)
 * - B. Subject token : [lexa-TOKEN] dans le sujet   (fallback universel)
 *
 * Phase 1 V1.2 — whitepaper "zéro saisie manuelle".
 */

import type { ParsedMail, Attachment } from "mailparser";
import { query } from "../db/postgres.js";
import { uploadDocumentFromBuffer } from "./DocumentIngest.js";
import { createEntryFromDocument } from "./DocumentIngest.js";

const SUBJECT_TOKEN_REGEX = /\[lexa-([a-z0-9]{8,16})\]/i;

/**
 * Point d'entrée principal — appelé par ImapListener pour chaque email non-lu.
 */
export async function routeIncomingEmail(parsed: ParsedMail): Promise<void> {
  const fromAddress = parsed.from?.text ?? "unknown";
  const subject = parsed.subject ?? "";

  const token = extractToken(parsed);

  if (!token) {
    console.info(`[email-router] ignored (no token): from=${fromAddress} subject="${subject}"`);
    return;
  }

  // Résoudre token → tenant (pas de RLS ici, service interne)
  const { rows } = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM tenant_email_tokens WHERE token = $1 AND enabled = true LIMIT 1`,
    [token],
  );

  if (rows.length === 0) {
    console.warn(`[email-router] unknown token: ${token} from=${fromAddress}`);
    return;
  }

  const tenantId = rows[0].tenant_id;
  const attachmentDocIds: string[] = [];

  // Traiter les pièces jointes valides
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  for (const att of attachments) {
    if (!shouldProcessAttachment(att)) continue;
    try {
      const docId = await uploadDocumentFromBuffer(
        tenantId,
        att.filename ?? "attachment",
        att.content,
        att.contentType ?? "application/octet-stream",
      );
      attachmentDocIds.push(docId);
      // Auto-création écriture (fire-and-forget)
      createEntryFromDocument(tenantId, docId).catch((e: Error) => {
        console.warn("[email-router] createEntry failed:", e.message);
      });
    } catch (err) {
      console.warn("[email-router] attachment upload failed:", (err as Error).message);
    }
  }

  const status = attachmentDocIds.length > 0 ? "processed" : "ignored";

  // Historique
  await query(
    `INSERT INTO email_forward_history
       (tenant_id, from_address, subject, attachments_count, attachments_ocr_ids, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, fromAddress, subject, attachmentDocIds.length, attachmentDocIds, status],
  );

  // Mettre à jour last_email_at
  await query(
    `UPDATE tenant_email_tokens SET last_email_at = now() WHERE tenant_id = $1`,
    [tenantId],
  );

  console.info(
    `[email-router] processed tenant=${tenantId} attachments=${attachmentDocIds.length} status=${status}`,
  );
}

/**
 * Extrait le token depuis l'email.
 * Stratégie A : subaddressing dans l'adresse `to:`
 * Stratégie B : regex dans le sujet
 */
function extractToken(parsed: ParsedMail): string | null {
  // Stratégie A — subaddressing
  const toField = parsed.to;
  const toList = Array.isArray(toField) ? toField : toField ? [toField] : [];
  for (const toAddr of toList) {
    for (const addr of toAddr.value ?? []) {
      const m = addr.address?.match(/\+([a-z0-9]{8,16})@/i);
      if (m) return m[1].toLowerCase();
    }
  }

  // Stratégie B — token dans le sujet
  const subMatch = (parsed.subject ?? "").match(SUBJECT_TOKEN_REGEX);
  if (subMatch) return subMatch[1].toLowerCase();

  return null;
}

/**
 * Filtre les pièces jointes à traiter (PDF, images, XML — max 10 MB).
 */
function shouldProcessAttachment(att: Attachment): boolean {
  if (!att.filename) return false;
  const name = att.filename.toLowerCase();
  const validExt =
    name.endsWith(".pdf") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".xml") ||
    name.endsWith(".webp");
  const validSize = (att.size ?? 0) < 10 * 1024 * 1024;
  return validExt && validSize;
}
