/**
 * CryptoSnapshotCron — cron annuel 2 janvier 02:00
 *
 * Cron pattern : 0 2 2 1 * (2 janvier à 02:00 Europe/Zurich)
 * Prend un snapshot N-1 pour tous les wallets de tous les tenants.
 *
 * Fail gracefully si Redis indisponible au startup.
 *
 * Déclenchable manuellement via CLI :
 *   pnpm --filter backend run crypto:snapshot 2025
 */

import { Queue } from "bullmq";
import { config } from "../config/index.js";
import { snapshotAllTenantsForYear } from "../services/crypto/snapshotService.js";

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  enableOfflineQueue: false,
};

export async function startCryptoSnapshotCron(): Promise<void> {
  try {
    const queue = new Queue("crypto-snapshot-cron", { connection: redisConnection });

    // Cron : 2 janvier 02:00 heure suisse → snapshot N-1
    await queue.upsertJobScheduler(
      "annual-crypto-snapshot",
      { pattern: "0 2 2 1 *", tz: "Europe/Zurich" },
      {
        name: "annual-crypto-snapshot",
        data: { triggeredBy: "cron" },
      },
    );

    console.log("[crypto-cron] Cron scheduled: 0 2 2 1 * (2 janv. 02:00 Europe/Zurich)");
  } catch (err) {
    console.warn("[crypto-cron] Failed to start cron (Redis unavailable?):", (err as Error).message);
  }
}

/**
 * Exécution manuelle du snapshot annuel.
 * Appelé par le script CLI crypto:snapshot.
 *
 * @param year - Année fiscale à snapshoter (ex: 2025)
 */
export async function runCryptoSnapshotForYear(year: number): Promise<void> {
  console.log(`[crypto-cron] Manual run: snapshotting year ${year} for all tenants`);
  await snapshotAllTenantsForYear(year);
  console.log(`[crypto-cron] Manual run complete for year ${year}`);
}

/**
 * Script CLI — appelé par `pnpm --filter backend run crypto:snapshot <year>`
 * Usage: tsx src/scheduler/cryptoSnapshotCron.ts 2025
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const yearArg = process.argv[2];
  const year = yearArg ? parseInt(yearArg, 10) : new Date().getFullYear() - 1;

  if (isNaN(year) || year < 2020 || year > 2100) {
    console.error(`Invalid year: ${yearArg}. Usage: tsx src/scheduler/cryptoSnapshotCron.ts <year>`);
    process.exit(1);
  }

  runCryptoSnapshotForYear(year)
    .then(() => {
      console.log(`Done.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Crypto snapshot failed:", err);
      process.exit(1);
    });
}
