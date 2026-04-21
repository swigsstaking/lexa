/**
 * Etherscan client — solde ETH à une date donnée (bloc le plus proche du 31.12)
 *
 * Free tier : 5 req/s, 100k req/jour.
 * Clé API requise : ETHERSCAN_API_KEY (env var).
 *
 * Retry x3 backoff exponentiel : 10s, 60s, 300s.
 */

import { config as _config } from "../../config/index.js";

const ETHERSCAN_BASE_URL = "https://api.etherscan.io/api";
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000];
// Nombre de Wei dans 1 ETH
const WEI_PER_ETH = 1e18;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function etherscanFetch<T>(params: Record<string, string>): Promise<T> {
  const apiKey = process.env.ETHERSCAN_API_KEY ?? _config.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY not configured");
  }

  const url = new URL(ETHERSCAN_BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("apikey", apiKey);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!;
      console.warn(`[Etherscan] retry ${attempt}/${RETRY_DELAYS_MS.length} after ${delay}ms`);
      await sleep(delay);
    }

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Etherscan HTTP ${response.status}`);
      }
      const json = (await response.json()) as { status: string; message: string; result: T };
      if (json.status !== "1") {
        throw new Error(`Etherscan error: ${json.message} — ${JSON.stringify(json.result)}`);
      }
      return json.result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[Etherscan] attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Etherscan fetch failed after retries");
}

/**
 * Trouve le numéro de bloc Ethereum le plus proche d'un timestamp Unix.
 */
async function getBlockNumberByTimestamp(timestamp: number): Promise<number> {
  const result = await etherscanFetch<string>({
    module: "block",
    action: "getblocknobytime",
    timestamp: String(timestamp),
    closest: "before",
  });
  const blockNumber = parseInt(result, 10);
  if (isNaN(blockNumber)) {
    throw new Error(`Etherscan: invalid block number: ${result}`);
  }
  return blockNumber;
}

/**
 * Retourne le solde ETH (en ETH, pas en Wei) d'une adresse à la fin de l'année fiscale.
 *
 * @param address - Adresse Ethereum (0x...)
 * @param year - Année fiscale (snapshot au 31.12 23:59:59 UTC)
 */
export async function getEthBalance(address: string, year: number): Promise<number> {
  // Timestamp Unix du 31.12 à 23:59:59 UTC
  const targetTimestamp = Math.floor(new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000);

  const blockNumber = await getBlockNumberByTimestamp(targetTimestamp);

  const weiBalance = await etherscanFetch<string>({
    module: "account",
    action: "balance",
    address,
    tag: String(blockNumber),
  });

  const balanceEth = parseInt(weiBalance, 10) / WEI_PER_ETH;
  if (isNaN(balanceEth)) {
    throw new Error(`Etherscan: invalid balance: ${weiBalance}`);
  }

  return balanceEth;
}
