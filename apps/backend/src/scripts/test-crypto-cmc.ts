/**
 * Test unitaire — client CoinMarketCap
 *
 * Vérifie que fetchHistoricalPricesChf fait exactement 1 seul appel HTTP
 * pour plusieurs symbols (ETH, BTC, SOL) en batch.
 *
 * Usage: tsx src/scripts/test-crypto-cmc.ts
 */

// Positionner les env vars AVANT tout import de module (config chargé à l'import)
process.env.CMC_API_KEY = "test-mock-key";
process.env.ETHERSCAN_API_KEY = "test-etherscan-key";

import { fetchHistoricalPricesChf, type CryptoSymbol } from "../services/crypto/coinmarketcap.js";

// ── Mock fetch (avant les imports de services) ────────────────────────────────

let fetchCallCount = 0;
const fetchedUrls: string[] = [];

const MOCK_CMC_RESPONSE = {
  status: { error_code: 0, error_message: null },
  data: {
    ETH: [
      {
        quotes: [
          { quote: { CHF: { price: 2850.50, timestamp: "2025-12-31T23:59:59.000Z" } } },
        ],
      },
    ],
    BTC: [
      {
        quotes: [
          { quote: { CHF: { price: 92500.00, timestamp: "2025-12-31T23:59:59.000Z" } } },
        ],
      },
    ],
    SOL: [
      {
        quotes: [
          { quote: { CHF: { price: 185.75, timestamp: "2025-12-31T23:59:59.000Z" } } },
        ],
      },
    ],
  },
};

// Override global fetch
(global as unknown as { fetch: unknown }).fetch = async (url: string | URL, _options?: RequestInit): Promise<Response> => {
  fetchCallCount += 1;
  fetchedUrls.push(url.toString());

  return {
    ok: true,
    status: 200,
    json: async () => MOCK_CMC_RESPONSE,
    text: async () => JSON.stringify(MOCK_CMC_RESPONSE),
  } as Response;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function testBatchRequest(): Promise<void> {
  console.log("\n[test] fetchHistoricalPricesChf — batch multi-symbols");

  fetchCallCount = 0;
  fetchedUrls.length = 0;

  const symbols: CryptoSymbol[] = ["ETH", "BTC", "SOL"];
  const prices = await fetchHistoricalPricesChf(2025, symbols);

  // 1 seul appel HTTP pour 3 symbols
  assert(fetchCallCount === 1, `exactement 1 appel HTTP (got ${fetchCallCount})`);

  // L'URL contient les 3 symbols
  const url = fetchedUrls[0] ?? "";
  assert(url.includes("symbol=ETH%2CBTC%2CSOL") || url.includes("symbol=ETH,BTC,SOL"), "URL contient ETH,BTC,SOL");
  assert(url.includes("convert=CHF"), "URL contient convert=CHF");
  assert(url.includes("2025-12-31"), "URL contient la date 31.12");

  // Prix corrects
  assert(prices.get("ETH") === 2850.50, `prix ETH correct (got ${prices.get("ETH")})`);
  assert(prices.get("BTC") === 92500.00, `prix BTC correct (got ${prices.get("BTC")})`);
  assert(prices.get("SOL") === 185.75, `prix SOL correct (got ${prices.get("SOL")})`);

  // Map contient tous les symbols
  assert(prices.size === 3, `map contient 3 symbols (got ${prices.size})`);
}

async function testSingleSymbol(): Promise<void> {
  console.log("\n[test] fetchHistoricalPricesChf — single symbol ETH");

  fetchCallCount = 0;

  const prices = await fetchHistoricalPricesChf(2025, ["ETH"]);

  assert(fetchCallCount === 1, `1 appel HTTP pour 1 symbol (got ${fetchCallCount})`);
  assert(prices.has("ETH"), "résultat contient ETH");
  assert(!prices.has("BTC"), "résultat ne contient pas BTC");
}

async function testMissingApiKey(): Promise<void> {
  console.log("\n[test] fetchHistoricalPricesChf — clé manquante → erreur");

  const savedKey = process.env.CMC_API_KEY;
  process.env.CMC_API_KEY = "";

  try {
    await fetchHistoricalPricesChf(2025, ["ETH"]);
    assert(false, "devrait lever une erreur si CMC_API_KEY absent");
  } catch (err) {
    const message = (err as Error).message;
    assert(message.includes("CMC_API_KEY"), `erreur mentionne CMC_API_KEY (got: ${message})`);
  } finally {
    process.env.CMC_API_KEY = savedKey;
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("=== Test unitaire CoinMarketCap client ===");

  await testBatchRequest();
  await testSingleSymbol();
  await testMissingApiKey();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
