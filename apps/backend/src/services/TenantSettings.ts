/**
 * TenantSettings — Service de gestion des paramètres tenant.
 *
 * Phase 3 V1.1 — toggle Pro sync per-tenant côté Lexa.
 * Permet à un tenant Lexa de refuser les events Pro même si Pro publie.
 */

import { query } from "../db/postgres.js";

/**
 * Vérifie si le sync Pro est activé pour un tenant.
 * Retourne true par défaut si aucune entrée n'existe (opt-in implicite).
 */
export async function isProSyncEnabled(tenantId: string): Promise<boolean> {
  const { rows } = await query<{ pro_sync_enabled: boolean }>(
    `SELECT pro_sync_enabled FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  return rows[0]?.pro_sync_enabled ?? true; // default true if no row
}

/**
 * Active ou désactive le sync Pro pour un tenant.
 * Si désactivé, enregistre la date et la raison optionnelle.
 */
export async function setProSyncEnabled(
  tenantId: string,
  enabled: boolean,
  reason?: string,
): Promise<void> {
  await query(
    `INSERT INTO tenant_settings (tenant_id, pro_sync_enabled, pro_sync_disabled_at, pro_sync_disabled_reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO UPDATE
       SET pro_sync_enabled = EXCLUDED.pro_sync_enabled,
           pro_sync_disabled_at = EXCLUDED.pro_sync_disabled_at,
           pro_sync_disabled_reason = EXCLUDED.pro_sync_disabled_reason,
           updated_at = now()`,
    [tenantId, enabled, enabled ? null : new Date(), enabled ? null : (reason ?? null)],
  );
}

/**
 * Récupère les paramètres Pro sync complets pour un tenant.
 */
export async function getProSyncSettings(tenantId: string): Promise<{
  enabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
}> {
  const { rows } = await query<{
    pro_sync_enabled: boolean;
    pro_sync_disabled_at: Date | null;
    pro_sync_disabled_reason: string | null;
  }>(
    `SELECT pro_sync_enabled, pro_sync_disabled_at, pro_sync_disabled_reason
     FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );

  if (rows.length === 0) {
    return { enabled: true, disabledAt: null, disabledReason: null };
  }

  return {
    enabled: rows[0].pro_sync_enabled,
    disabledAt: rows[0].pro_sync_disabled_at?.toISOString() ?? null,
    disabledReason: rows[0].pro_sync_disabled_reason ?? null,
  };
}
