/**
 * seed-qa-user — crée ou reset le user de test qa-lexa.
 *
 * Exécution :
 *   tsx src/scripts/seed-qa-user.ts
 *
 * Idempotent : si le user existe déjà, le password est simplement ré-hashé.
 * La company associée n'est pas recréée si le tenant existe déjà.
 *
 * Credentials utilisés par qa-lexa.ts :
 *   email    = qa@lexa.test
 *   password = QaLexa-Fixed-2026!
 *
 * Ces credentials sont hardcoded dans le script qa-lexa (pas de secret,
 * user de test dédié, dédié à .59 ou localhost dev).
 */

import { randomUUID } from "node:crypto";
import { query, closePool } from "../db/postgres.js";
import { hashPassword } from "../auth/jwt.js";

const QA_EMAIL = "qa@lexa.test";
const QA_PASSWORD = "QaLexa-Fixed-2026!";
const QA_COMPANY_NAME = "QA Lexa Sàrl";

async function main(): Promise<void> {
  try {
    const existing = await query<{ id: string; tenant_id: string }>(
      "SELECT id, tenant_id FROM users WHERE email = $1",
      [QA_EMAIL],
    );

    const passwordHash = await hashPassword(QA_PASSWORD);

    if (existing.rows.length > 0) {
      const user = existing.rows[0]!;
      await query(
        "UPDATE users SET password_hash = $1, verified = true WHERE id = $2",
        [passwordHash, user.id],
      );
      console.log(
        `[seed-qa-user] reset password for existing user ${user.id} (tenant ${user.tenant_id})`,
      );
      return;
    }

    const tenantId = randomUUID();

    await query(
      `INSERT INTO companies (
         tenant_id, name, legal_form, canton, country, is_vat_subject,
         vat_declaration_frequency, vat_method, source
       ) VALUES ($1, $2, 'sarl', 'VS', 'CH', true, 'quarterly', 'effective', 'manual')`,
      [tenantId, QA_COMPANY_NAME],
    );

    const userResult = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, tenant_id, verified)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [QA_EMAIL, passwordHash, tenantId],
    );

    console.log(
      `[seed-qa-user] created user ${userResult.rows[0]!.id} with tenant ${tenantId}`,
    );
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error("[seed-qa-user] failed:", err);
  process.exit(1);
});
