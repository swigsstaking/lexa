/**
 * LedgerRefresh — debounced async refresh of the ledger_entries materialized view.
 *
 * After each TransactionClassified persist, we trigger a refresh so that
 * the workspace reflects new classifications without manual intervention.
 *
 * Debounce: when 50 tx are classified in a burst (~5 min), we only need one
 * REFRESH at the end — not 50. Each tenant gets its own debounce timer.
 *
 * Strategy: REFRESH MATERIALIZED VIEW CONCURRENTLY (non-locking) if the
 * unique index ux_ledger_entries_pk exists. Falls back to regular REFRESH
 * (locks reads for ~0.5-2s) if CONCURRENTLY fails (e.g., index not yet built).
 */

import { query } from "../db/postgres.js";

const DEBOUNCE_MS = 2500; // 2.5s debounce per tenant

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a debounced ledger refresh for the given tenant.
 * Fire-and-forget: never throws.
 */
export function scheduleLedgerRefresh(tenantId: string): void {
  // Clear any pending timer for this tenant
  const existing = pendingTimers.get(tenantId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingTimers.delete(tenantId);
    doRefresh(tenantId);
  }, DEBOUNCE_MS);

  pendingTimers.set(tenantId, timer);
}

async function doRefresh(tenantId: string): Promise<void> {
  try {
    // Try CONCURRENTLY first (requires unique index ux_ledger_entries_pk)
    await query("REFRESH MATERIALIZED VIEW CONCURRENTLY ledger_entries");
    console.log(`[ledger-refresh] CONCURRENTLY refreshed for tenant ${tenantId}`);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("CONCURRENTLY") || msg.includes("unique index")) {
      // Fallback: regular refresh (briefly locks reads, acceptable in V1)
      try {
        await query("REFRESH MATERIALIZED VIEW ledger_entries");
        console.log(`[ledger-refresh] fallback REFRESH for tenant ${tenantId}`);
      } catch (e2) {
        console.warn(`[ledger-refresh] fallback also failed for tenant ${tenantId}:`, (e2 as Error).message);
      }
    } else {
      console.warn(`[ledger-refresh] refresh failed for tenant ${tenantId}:`, msg);
    }
  }
}
