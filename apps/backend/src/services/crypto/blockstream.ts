/**
 * Blockstream client — solde BTC à une date donnée
 *
 * API publique sans clé : https://blockstream.info/api
 * Stratégie : récupérer l'historique des UTXOs + transactions pour
 * calculer le solde au bloc le plus proche du 31.12.
 *
 * Retry x3 backoff exponentiel : 10s, 60s, 300s.
 */

const BLOCKSTREAM_BASE_URL = "https://blockstream.info/api";
const SATOSHI_PER_BTC = 1e8;
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blockstreamFetch<T>(path: string): Promise<T> {
  const url = `${BLOCKSTREAM_BASE_URL}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!;
      console.warn(`[Blockstream] retry ${attempt}/${RETRY_DELAYS_MS.length} after ${delay}ms`);
      await sleep(delay);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Blockstream HTTP ${response.status} on ${path}`);
      }
      return (await response.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[Blockstream] attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Blockstream fetch failed after retries");
}

interface BlockstreamTx {
  txid: string;
  status: { confirmed: boolean; block_height: number; block_time: number };
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value: number } }>;
}

interface BlockstreamBlock {
  id: string;
  height: number;
  timestamp: number;
}

/**
 * Trouve la hauteur de bloc Bitcoin la plus proche d'un timestamp Unix.
 * Utilise la recherche binaire via l'API Blockstream.
 */
async function getBlockHeightByTimestamp(targetTimestamp: number): Promise<number> {
  // Blockstream ne fournit pas d'endpoint direct "block by timestamp"
  // On récupère le tip height et on descend via les block heights estimées
  const tipHash = await blockstreamFetch<string>("/blocks/tip/hash");
  const tipBlock = await blockstreamFetch<BlockstreamBlock>(`/block/${tipHash}`);

  // Estimation grossière basée sur le timestamp (1 bloc ~10 min)
  const secondsPerBlock = 600;
  const blocksDiff = Math.floor((tipBlock.timestamp - targetTimestamp) / secondsPerBlock);
  const estimatedHeight = Math.max(1, tipBlock.height - blocksDiff);

  // Chercher le hash du bloc à la hauteur estimée
  const blockHash = await blockstreamFetch<string>(`/block-height/${estimatedHeight}`);
  const block = await blockstreamFetch<BlockstreamBlock>(`/block/${blockHash}`);

  // Affiner si nécessaire (chercher le bloc juste avant le timestamp cible)
  if (block.timestamp <= targetTimestamp) {
    return block.height;
  }

  // Descendre jusqu'à trouver un bloc avant le timestamp cible
  let height = block.height - 1;
  while (height > 0) {
    const hash = await blockstreamFetch<string>(`/block-height/${height}`);
    const b = await blockstreamFetch<BlockstreamBlock>(`/block/${hash}`);
    if (b.timestamp <= targetTimestamp) {
      return height;
    }
    height -= 1;
  }

  return 1;
}

/**
 * Retourne le solde BTC (en BTC, pas en satoshis) d'une adresse à la fin de l'année fiscale.
 *
 * Calcule le solde en sommant les UTXOs confirmés jusqu'au bloc cible.
 *
 * @param address - Adresse Bitcoin
 * @param year - Année fiscale (snapshot au 31.12 23:59:59 UTC)
 */
export async function getBtcBalance(address: string, year: number): Promise<number> {
  const targetTimestamp = Math.floor(new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000);
  const targetHeight = await getBlockHeightByTimestamp(targetTimestamp);

  // Récupérer les transactions de l'adresse
  const txs = await blockstreamFetch<BlockstreamTx[]>(`/address/${address}/txs`);

  let balanceSatoshis = 0;

  for (const tx of txs) {
    // Ignorer les transactions non confirmées ou après le bloc cible
    if (!tx.status.confirmed || tx.status.block_height > targetHeight) {
      continue;
    }

    // Ajouter les sorties vers cette adresse
    for (const vout of tx.vout) {
      if (vout.scriptpubkey_address === address) {
        balanceSatoshis += vout.value;
      }
    }

    // Soustraire les entrées depuis cette adresse
    for (const vin of tx.vin) {
      if (vin.prevout?.scriptpubkey_address === address) {
        balanceSatoshis -= vin.prevout.value;
      }
    }
  }

  return balanceSatoshis / SATOSHI_PER_BTC;
}
