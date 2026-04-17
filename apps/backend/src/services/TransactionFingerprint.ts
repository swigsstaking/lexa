import crypto from "node:crypto";
import { queryAsTenant } from "../db/postgres.js";

/**
 * Normalise une description pour le fingerprint cross-source.
 * - em-dash / en-dash → tiret simple (Pro utilise em-dash, CAMT n'en a pas)
 * - ponctuation non-alphanumérique retirée
 * - espaces normalisés, lowercase, tronqué à 80 chars
 */
function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .replace(/—|–|−/g, "-") // em-dash, en-dash → tiret simple
    .replace(/[^\w\s-]/g, " ") // retirer la ponctuation résiduelle
    .replace(/\s+/g, " ") // effondrer les espaces multiples
    .trim()
    .slice(0, 80); // tronquer pour cohérence du hash
}

/**
 * Empreinte courte d'une transaction bancaire pour dedup cross-source.
 *
 * IMPORTANT : IBAN et bankRef ne sont PAS inclus car côté Pro (invoice.paid,
 * bank.transaction) ces données sont souvent absentes. Le fingerprint se base
 * uniquement sur (amount, date, description normalisée) — ce trio est suffisant
 * pour la déduplication CAMT ↔ Pro. La collision sur 2 vrais paiements identiques
 * le même jour est acceptée (edge case rare, traité via audit).
 */
export function computeFingerprint(params: {
  amount: number;
  date: string; // YYYY-MM-DD
  description?: string;
  iban?: string; // ignoré — conservé pour compatibilité des appelants CAMT
  bankRef?: string; // ignoré — conservé pour compatibilité des appelants CAMT
}): string {
  const parts = [
    params.amount.toFixed(2),
    params.date,
    normalizeDescription(params.description || ""),
  ];
  return crypto
    .createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 16); // 16 hex chars = ~64 bits, plenty for scoped collisions
}

/**
 * Cherche un TransactionIngested avec le même fingerprint dans le tenant.
 * Retourne streamId si trouvé, sinon null.
 */
export async function lookupByFingerprint(
  tenantId: string,
  fingerprint: string,
): Promise<{ streamId: string; eventId: string } | null> {
  const { rows } = await queryAsTenant<{ stream_id: string; id: string }>(
    tenantId,
    `SELECT stream_id, id FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionIngested'
       AND metadata->>'fingerprint' = $2
     ORDER BY occurred_at ASC
     LIMIT 1`,
    [tenantId, fingerprint],
  );
  return rows[0] ? { streamId: rows[0].stream_id, eventId: rows[0].id } : null;
}

/**
 * Enrichit le metadata d'un event existant (ex: ajouter reconciles après coup).
 * Utilise une update JSONB merge.
 */
export async function enrichEventMetadata(
  tenantId: string,
  eventId: string,
  mergeMetadata: Record<string, unknown>,
): Promise<void> {
  await queryAsTenant(
    tenantId,
    `UPDATE events SET metadata = metadata || $2::jsonb WHERE id = $1 AND tenant_id = $3`,
    [eventId, JSON.stringify(mergeMetadata), tenantId],
  );
}
