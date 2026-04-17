import crypto from "node:crypto";
import { queryAsTenant } from "../db/postgres.js";

/**
 * Empreinte courte d'une transaction bancaire pour dedup cross-source.
 * Collision acceptable : 2 paiements exactement identiques le même jour avec même description.
 * Dans ce cas, l'user peut dupliquer manuellement via "dupliquer cette écriture".
 */
export function computeFingerprint(params: {
  amount: number;
  date: string; // YYYY-MM-DD
  description?: string;
  iban?: string;
  bankRef?: string; // e.g. SCOR reference from CAMT
}): string {
  const parts = [
    params.amount.toFixed(2),
    params.date,
    (params.iban || "").toLowerCase().replace(/\s/g, ""),
    (params.bankRef || "").toLowerCase().trim(),
    (params.description || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 100),
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
