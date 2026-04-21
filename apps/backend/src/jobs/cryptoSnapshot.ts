/**
 * CryptoSnapshot BullMQ Worker
 *
 * Queues :
 *   - crypto.snapshot.single : snapshot d'un wallet individuel
 *   - crypto.snapshot.annual : snapshot de tous les wallets d'un tenant pour une année
 *
 * Retry : x3 avec backoff exponentiel géré au niveau BullMQ (10s, 60s, 300s).
 */

import { Queue, Worker, type Job } from "bullmq";
import { config } from "../config/index.js";
import { snapshotSingleWallet, snapshotAllWalletsForTenant } from "../services/crypto/snapshotService.js";
import { queryAsTenant } from "../db/postgres.js";

export interface CryptoSnapshotSingleJobData {
  walletId: string;
  tenantId: string;
  year: number;
}

export interface CryptoSnapshotAnnualJobData {
  tenantId: string;
  year: number;
}

type CryptoJobData = CryptoSnapshotSingleJobData | CryptoSnapshotAnnualJobData;

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  enableOfflineQueue: false,
};

// BullMQ backoff exponentiel : 10s, 60s, 300s (3 retries)
const defaultJobOptions = {
  attempts: 4, // 1 try + 3 retries
  backoff: {
    type: "custom" as const,
  },
};

export let cryptoSnapshotQueue: Queue | null = null;
let cryptoSnapshotWorker: Worker | null = null;

export async function startCryptoSnapshotWorker(): Promise<void> {
  try {
    cryptoSnapshotQueue = new Queue("crypto-snapshot", {
      connection: redisConnection,
      defaultJobOptions,
    });

    cryptoSnapshotWorker = new Worker<CryptoJobData>(
      "crypto-snapshot",
      async (job: Job<CryptoJobData>) => {
        if (job.name === "crypto.snapshot.single") {
          const data = job.data as CryptoSnapshotSingleJobData;
          await processSingleSnapshot(data);
        } else if (job.name === "crypto.snapshot.annual") {
          const data = job.data as CryptoSnapshotAnnualJobData;
          await processAnnualSnapshot(data);
        } else {
          throw new Error(`Unknown job name: ${job.name}`);
        }
      },
      {
        connection: redisConnection,
        concurrency: 3,
        // Backoff personnalisé : 10s, 60s, 300s
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            const delays = [10_000, 60_000, 300_000];
            return delays[Math.min(attemptsMade - 1, delays.length - 1)] ?? 300_000;
          },
        },
      },
    );

    cryptoSnapshotWorker.on("error", (err) => {
      console.error("[crypto-snapshot] worker error:", err.message);
    });
    cryptoSnapshotWorker.on("completed", (job) => {
      console.log(`[crypto-snapshot] job ${job.id} (${job.name}) completed`);
    });
    cryptoSnapshotWorker.on("failed", (job, err) => {
      console.error(`[crypto-snapshot] job ${job?.id} (${job?.name}) failed:`, err.message);
    });

    console.log("[crypto-snapshot] Worker started");
  } catch (err) {
    console.warn("[crypto-snapshot] Failed to start worker (Redis unavailable?):", (err as Error).message);
  }
}

/**
 * Enqueue un job de snapshot pour un wallet individuel.
 * Retourne le job ID pour polling côté route.
 */
export async function enqueueSingleSnapshot(
  walletId: string,
  tenantId: string,
  year: number,
): Promise<string> {
  if (!cryptoSnapshotQueue) {
    throw new Error("Crypto snapshot queue not initialized");
  }
  const job = await cryptoSnapshotQueue.add(
    "crypto.snapshot.single",
    { walletId, tenantId, year } satisfies CryptoSnapshotSingleJobData,
  );
  return job.id ?? `job-${Date.now()}`;
}

/**
 * Enqueue un job de snapshot annuel pour tous les wallets d'un tenant.
 */
export async function enqueueAnnualSnapshot(tenantId: string, year: number): Promise<string> {
  if (!cryptoSnapshotQueue) {
    throw new Error("Crypto snapshot queue not initialized");
  }
  const job = await cryptoSnapshotQueue.add(
    "crypto.snapshot.annual",
    { tenantId, year } satisfies CryptoSnapshotAnnualJobData,
  );
  return job.id ?? `job-${Date.now()}`;
}

// ── Job processors ────────────────────────────────────────────────────────────

async function processSingleSnapshot(data: CryptoSnapshotSingleJobData): Promise<void> {
  const { walletId, tenantId, year } = data;

  // Récupérer le wallet depuis la base
  const { rows } = await queryAsTenant<{
    id: string;
    tenant_id: string;
    chain: "eth" | "btc" | "sol";
    address: string;
    label: string | null;
  }>(
    tenantId,
    `SELECT id, tenant_id, chain, address, label
     FROM pp_crypto_wallets
     WHERE id = $1 AND tenant_id = $2`,
    [walletId, tenantId],
  );

  if (rows.length === 0) {
    throw new Error(`Wallet ${walletId} not found for tenant ${tenantId}`);
  }

  const wallet = rows[0]!;
  const result = await snapshotSingleWallet(wallet, year);

  if (!result.ok) {
    throw new Error(result.error ?? "Snapshot failed");
  }

  console.log(`[crypto-snapshot] wallet ${walletId} (${wallet.chain}) → ${result.balanceChf.toFixed(2)} CHF`);
}

async function processAnnualSnapshot(data: CryptoSnapshotAnnualJobData): Promise<void> {
  const { tenantId, year } = data;
  const results = await snapshotAllWalletsForTenant(tenantId, year);
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[crypto-snapshot] annual ${tenantId} ${year}: ${ok} ok, ${failed} failed`);

  if (failed > 0) {
    const errors = results.filter((r) => !r.ok).map((r) => r.error).join("; ");
    throw new Error(`${failed} wallet(s) failed: ${errors}`);
  }
}
