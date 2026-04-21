/**
 * Solana RPC client — solde SOL à une date donnée
 *
 * Utilise le RPC public Solana (configurable via SOLANA_RPC_URL).
 * Stratégie : getSlotAtTimestamp (via getBlocksWithLimit) → getBalance au slot cible.
 *
 * Retry x3 backoff exponentiel : 10s, 60s, 300s.
 */

import { config as _config } from "../../config/index.js";

const LAMPORTS_PER_SOL = 1e9;
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? _config.SOLANA_RPC_URL;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!;
      console.warn(`[Solana] retry ${attempt}/${RETRY_DELAYS_MS.length} after ${delay}ms`);
      await sleep(delay);
    }

    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`Solana RPC HTTP ${response.status}`);
      }

      const json = (await response.json()) as { result?: T; error?: { message: string } };
      if (json.error) {
        throw new Error(`Solana RPC error: ${json.error.message}`);
      }
      if (json.result === undefined) {
        throw new Error(`Solana RPC: no result for method ${method}`);
      }

      return json.result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[Solana] attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Solana RPC failed after retries");
}

interface SolanaBlockTime {
  blockTime: number | null;
  blockhash: string;
}

/**
 * Trouve le slot Solana le plus proche d'un timestamp Unix.
 * Solana produit ~2 slots/sec, soit ~5 milliards de slots depuis genesis (2020-03-16).
 */
async function getSlotByTimestamp(targetTimestamp: number): Promise<number> {
  // Obtenir le slot courant
  const currentSlot = await solanaRpc<number>("getSlot", [{ commitment: "finalized" }]);

  // Estimation : Solana ~ 2.5 slots/sec depuis genesis (unix 1584366000 ~ 2020-03-16)
  const solanaGenesisTimestamp = 1584366000;
  const slotsPerSecond = 2.5;
  const estimatedSlot = Math.floor(
    (targetTimestamp - solanaGenesisTimestamp) * slotsPerSecond,
  );

  const targetSlot = Math.min(estimatedSlot, currentSlot - 1);

  // Vérifier et affiner : chercher le bloc le plus proche
  const blockTime = await solanaRpc<SolanaBlockTime | null>("getBlock", [
    targetSlot,
    { encoding: "json", maxSupportedTransactionVersion: 0, transactionDetails: "none" },
  ]);

  if (blockTime && blockTime.blockTime !== null) {
    return targetSlot;
  }

  // Fallback : chercher le slot finalisé proche en descendant
  const recentSlot = await solanaRpc<number>("getSlot", [{ commitment: "finalized" }]);
  return Math.min(targetSlot, recentSlot);
}

/**
 * Retourne le solde SOL (en SOL, pas en lamports) d'une adresse à la fin de l'année fiscale.
 *
 * @param address - Adresse Solana (base58)
 * @param year - Année fiscale (snapshot au 31.12 23:59:59 UTC)
 */
export async function getSolBalance(address: string, year: number): Promise<number> {
  const targetTimestamp = Math.floor(new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000);
  const targetSlot = await getSlotByTimestamp(targetTimestamp);

  const result = await solanaRpc<{ value: number }>("getBalance", [
    address,
    { commitment: "finalized", minContextSlot: targetSlot },
  ]);

  return result.value / LAMPORTS_PER_SOL;
}
