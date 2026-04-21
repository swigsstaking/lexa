/**
 * CryptoSnapshotService — orchestration snapshot annuel crypto
 *
 * Pour chaque wallet :
 *   1. Fetch balance native (ETH/BTC/SOL) via client dédié
 *   2. Fetch prix CHF au 31.12 via CoinMarketCap (1 seul appel batch multi-symbols)
 *   3. Calcule balance_chf = balance_native * price_chf
 *   4. UPSERT idempotent dans pp_crypto_snapshots sur (wallet_id, year)
 *
 * Règle absolue : queryAsTenant() sur toutes les requêtes PG.
 */

import { queryAsTenant } from "../../db/postgres.js";
import { fetchHistoricalPricesChf, type CryptoSymbol } from "./coinmarketcap.js";
import { getEthBalance } from "./etherscan.js";
import { getBtcBalance } from "./blockstream.js";
import { getSolBalance } from "./solana.js";

export interface WalletRow {
  id: string;
  tenant_id: string;
  chain: "eth" | "btc" | "sol";
  address: string;
  label: string | null;
}

export interface SnapshotResult {
  walletId: string;
  chain: string;
  year: number;
  balanceNative: number;
  balanceChf: number;
  priceChfAt3112: number;
  balanceSource: string;
  ok: boolean;
  error?: string;
}

const CHAIN_TO_SYMBOL: Record<string, CryptoSymbol> = {
  eth: "ETH",
  btc: "BTC",
  sol: "SOL",
};

const CHAIN_TO_SOURCE: Record<string, string> = {
  eth: "etherscan",
  btc: "blockstream",
  sol: "solana_rpc",
};

/**
 * Fetches balance native for a single wallet at end-of-year.
 */
async function fetchBalance(chain: string, address: string, year: number): Promise<number> {
  switch (chain) {
    case "eth":
      return getEthBalance(address, year);
    case "btc":
      return getBtcBalance(address, year);
    case "sol":
      return getSolBalance(address, year);
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

/**
 * Crée ou met à jour le snapshot pour un wallet donné.
 * UPSERT idempotent sur (wallet_id, year).
 */
async function upsertSnapshot(
  tenantId: string,
  walletId: string,
  year: number,
  balanceNative: number,
  balanceChf: number,
  priceChfAt3112: number,
  balanceSource: string,
): Promise<void> {
  await queryAsTenant(
    tenantId,
    `INSERT INTO pp_crypto_snapshots
       (tenant_id, wallet_id, year, balance_native, balance_chf, price_chf_at_31_12,
        price_source, balance_source, snapshotted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'coinmarketcap', $7, now())
     ON CONFLICT (wallet_id, year) DO UPDATE SET
       balance_native     = EXCLUDED.balance_native,
       balance_chf        = EXCLUDED.balance_chf,
       price_chf_at_31_12 = EXCLUDED.price_chf_at_31_12,
       balance_source     = EXCLUDED.balance_source,
       snapshotted_at     = now()`,
    [tenantId, walletId, year, balanceNative.toFixed(18), balanceChf.toFixed(2), priceChfAt3112.toFixed(8), balanceSource],
  );
}

/**
 * Snapshot annuel pour un seul wallet.
 * Fait son propre appel CMC (utiliser snapshotAllWallets pour batch multi-wallets).
 */
export async function snapshotSingleWallet(
  wallet: WalletRow,
  year: number,
): Promise<SnapshotResult> {
  const symbol = CHAIN_TO_SYMBOL[wallet.chain];
  const balanceSource = CHAIN_TO_SOURCE[wallet.chain] ?? "unknown";

  if (!symbol) {
    return { walletId: wallet.id, chain: wallet.chain, year, balanceNative: 0, balanceChf: 0, priceChfAt3112: 0, balanceSource, ok: false, error: `Unsupported chain: ${wallet.chain}` };
  }

  try {
    // Fetch prix CHF (1 appel CMC pour ce seul symbol)
    const priceMap = await fetchHistoricalPricesChf(year, [symbol]);
    const priceChf = priceMap.get(symbol);
    if (priceChf === undefined) {
      throw new Error(`No CHF price returned for ${symbol}`);
    }

    // Fetch balance
    const balanceNative = await fetchBalance(wallet.chain, wallet.address, year);
    const balanceChf = balanceNative * priceChf;

    // UPSERT
    await upsertSnapshot(wallet.tenant_id, wallet.id, year, balanceNative, balanceChf, priceChf, balanceSource);

    return { walletId: wallet.id, chain: wallet.chain, year, balanceNative, balanceChf, priceChfAt3112: priceChf, balanceSource, ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[snapshot] wallet ${wallet.id} (${wallet.chain}) failed:`, error);
    return { walletId: wallet.id, chain: wallet.chain, year, balanceNative: 0, balanceChf: 0, priceChfAt3112: 0, balanceSource, ok: false, error };
  }
}

/**
 * Snapshot annuel pour tous les wallets d'un tenant.
 * 1 seul appel CMC multi-symbols pour tous les wallets.
 * Balances fetchées en parallèle (max 5 concurrent).
 */
export async function snapshotAllWalletsForTenant(
  tenantId: string,
  year: number,
): Promise<SnapshotResult[]> {
  // Récupérer tous les wallets du tenant
  const { rows: wallets } = await queryAsTenant<WalletRow>(
    tenantId,
    `SELECT id, tenant_id, chain, address, label
     FROM pp_crypto_wallets
     WHERE tenant_id = $1`,
    [tenantId],
  );

  if (wallets.length === 0) {
    return [];
  }

  // Collecter les symbols uniques pour 1 seul appel CMC batch
  const uniqueSymbols = [
    ...new Set(
      wallets
        .map((w) => CHAIN_TO_SYMBOL[w.chain])
        .filter((s): s is CryptoSymbol => s !== undefined),
    ),
  ];

  // 1 SEUL appel CMC pour tous les symbols
  const priceMap = await fetchHistoricalPricesChf(year, uniqueSymbols);

  // Fetch balances en parallèle (max 5 concurrent)
  const results: SnapshotResult[] = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < wallets.length; i += CONCURRENCY) {
    const batch = wallets.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (wallet) => {
        const symbol = CHAIN_TO_SYMBOL[wallet.chain];
        const balanceSource = CHAIN_TO_SOURCE[wallet.chain] ?? "unknown";

        if (!symbol) {
          return { walletId: wallet.id, chain: wallet.chain, year, balanceNative: 0, balanceChf: 0, priceChfAt3112: 0, balanceSource, ok: false, error: `Unsupported chain: ${wallet.chain}` };
        }

        const priceChf = priceMap.get(symbol);
        if (priceChf === undefined) {
          return { walletId: wallet.id, chain: wallet.chain, year, balanceNative: 0, balanceChf: 0, priceChfAt3112: 0, balanceSource, ok: false, error: `No CHF price for ${symbol}` };
        }

        try {
          const balanceNative = await fetchBalance(wallet.chain, wallet.address, year);
          const balanceChf = balanceNative * priceChf;

          await upsertSnapshot(wallet.tenant_id, wallet.id, year, balanceNative, balanceChf, priceChf, balanceSource);

          return { walletId: wallet.id, chain: wallet.chain, year, balanceNative, balanceChf, priceChfAt3112: priceChf, balanceSource, ok: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          console.error(`[snapshot] wallet ${wallet.id} (${wallet.chain}) failed:`, error);
          return { walletId: wallet.id, chain: wallet.chain, year, balanceNative: 0, balanceChf: 0, priceChfAt3112: 0, balanceSource, ok: false, error };
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Snapshot annuel pour tous les tenants actifs.
 * Utilisé par le cron 0 2 2 1 * (2 janvier 02:00).
 */
export async function snapshotAllTenantsForYear(year: number): Promise<void> {
  const { rows } = await queryAsTenant<{ tenant_id: string }>(
    "00000000-0000-0000-0000-000000000000", // superuser — bypass RLS pour listing global
    `SELECT DISTINCT tenant_id FROM pp_crypto_wallets`,
    [],
  );

  console.log(`[crypto-cron] Snapshotting ${rows.length} tenants for year ${year}`);

  for (const { tenant_id } of rows) {
    try {
      const results = await snapshotAllWalletsForTenant(tenant_id, year);
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      console.log(`[crypto-cron] tenant ${tenant_id}: ${ok} ok, ${failed} failed`);
    } catch (err) {
      console.error(`[crypto-cron] tenant ${tenant_id} failed:`, (err as Error).message);
    }
  }
}
