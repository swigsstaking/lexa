/**
 * MembershipService — gestion des appartenances fiduciaire (N:M user ↔ tenant)
 * Session 32 — 2026-04-16
 */

import { query } from "../db/postgres.js";

export type Membership = {
  tenantId: string;
  role: "owner" | "fiduciary" | "viewer";
  tenantName: string | null;
  addedAt: string;
};

/**
 * Liste tous les tenants accessibles à un user (via fiduciary_memberships).
 * Tente un JOIN avec companies pour récupérer le nom — fallback gracieux si absent.
 */
export async function listUserMemberships(userId: string): Promise<Membership[]> {
  const { rows } = await query<{
    tenant_id: string;
    role: string;
    tenant_name: string | null;
    added_at: Date;
  }>(
    `SELECT fm.tenant_id, fm.role, c.name AS tenant_name, fm.added_at
     FROM fiduciary_memberships fm
     LEFT JOIN companies c ON c.tenant_id = fm.tenant_id
     WHERE fm.user_id = $1
     ORDER BY fm.added_at ASC`,
    [userId],
  );

  return rows.map((r) => ({
    tenantId: r.tenant_id,
    role: r.role as Membership["role"],
    tenantName: r.tenant_name,
    addedAt: r.added_at.toISOString(),
  }));
}

/**
 * Vérifie qu'un user a un membership actif sur un tenant donné.
 */
export async function validateMembership(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM fiduciary_memberships WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  return rows.length > 0;
}

/**
 * Accorde un membership (idempotent via ON CONFLICT DO NOTHING).
 */
export async function grantMembership(
  userId: string,
  tenantId: string,
  role: "owner" | "fiduciary" | "viewer",
): Promise<void> {
  await query(
    `INSERT INTO fiduciary_memberships (user_id, tenant_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`,
    [userId, tenantId, role],
  );
}

/**
 * Révoque un membership.
 */
export async function revokeMembership(
  userId: string,
  tenantId: string,
): Promise<void> {
  await query(
    `DELETE FROM fiduciary_memberships WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
}
