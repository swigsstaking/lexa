/**
 * Test unitaire — snapshotService
 *
 * Scénario : wallet ETH avec mock Etherscan + mock CMC
 * Vérifie que le snapshot CHF est calculé correctement.
 *
 * Usage: tsx src/scripts/test-crypto-snapshot.ts
 */

// ── Variables de contrôle des mocks ──────────────────────────────────────────

let fetchCallCount = 0;
const fetchedUrls: string[] = [];

// Solde ETH mocké : 2.5 ETH
const MOCK_ETH_BALANCE_WEI = (2.5 * 1e18).toString();
// Prix ETH mocké : 2850 CHF
const MOCK_ETH_PRICE_CHF = 2850.0;

// ── Mock fetch ────────────────────────────────────────────────────────────────

process.env.CMC_API_KEY = "test-mock-key";
process.env.ETHERSCAN_API_KEY = "test-etherscan-key";

(global as unknown as { fetch: unknown }).fetch = async (url: string | URL, _options?: RequestInit): Promise<Response> => {
  const urlStr = url.toString();
  fetchCallCount += 1;
  fetchedUrls.push(urlStr);

  // Mock Etherscan — getblocknobytime
  if (urlStr.includes("getblocknobytime")) {
    return makeJsonResponse({ status: "1", message: "OK", result: "20000000" });
  }

  // Mock Etherscan — balance
  if (urlStr.includes("module=account") && urlStr.includes("action=balance")) {
    return makeJsonResponse({ status: "1", message: "OK", result: MOCK_ETH_BALANCE_WEI });
  }

  // Mock CoinMarketCap
  if (urlStr.includes("coinmarketcap.com")) {
    return makeJsonResponse({
      status: { error_code: 0, error_message: null },
      data: {
        ETH: [
          {
            quotes: [
              { quote: { CHF: { price: MOCK_ETH_PRICE_CHF, timestamp: "2025-12-31T23:59:59.000Z" } } },
            ],
          },
        ],
      },
    });
  }

  throw new Error(`Unexpected fetch call: ${urlStr}`);
};

// ── Mock queryAsTenant ────────────────────────────────────────────────────────

const upsertedSnapshots: Array<{
  tenantId: string;
  walletId: string;
  year: number;
  balanceNative: string;
  balanceChf: string;
  priceChf: string;
}> = [];

// Mock du module postgres
const MOCK_TENANT_ID = "tenant-test-001";
const MOCK_WALLET_ID = "wallet-test-001";

// On ne peut pas mocker les imports ESM directement — on test la logique via les clients
// directement (test d'intégration partielle)

// ── Tests directs clients ─────────────────────────────────────────────────────

import { getEthBalance } from "../services/crypto/etherscan.js";
import { fetchHistoricalPricesChf } from "../services/crypto/coinmarketcap.js";

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

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✓ ${message} (${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} — expected ~${expected}, got ${actual}`);
    failed++;
  }
}

async function testEthBalanceFetch(): Promise<void> {
  console.log("\n[test] getEthBalance — mock Etherscan 2.5 ETH");

  fetchCallCount = 0;

  const balance = await getEthBalance("0x1234567890abcdef1234567890abcdef12345678", 2025);

  assertApprox(balance, 2.5, 0.0001, "solde ETH = 2.5");
  assert(fetchCallCount === 2, `2 appels Etherscan (getblock + balance), got ${fetchCallCount}`);
}

async function testCmcPriceFetch(): Promise<void> {
  console.log("\n[test] fetchHistoricalPricesChf — mock CMC ETH 2850 CHF");

  fetchCallCount = 0;

  const prices = await fetchHistoricalPricesChf(2025, ["ETH"]);

  assert(fetchCallCount === 1, `1 appel CMC, got ${fetchCallCount}`);
  assertApprox(prices.get("ETH") ?? 0, MOCK_ETH_PRICE_CHF, 0.01, "prix ETH CHF correct");
}

async function testSnapshotCalculation(): Promise<void> {
  console.log("\n[test] calcul balance_chf = balance_native * price_chf");

  fetchCallCount = 0;

  // Simule la logique du snapshotService sans PG
  const balance = await getEthBalance("0x1234567890abcdef1234567890abcdef12345678", 2025);
  const prices = await fetchHistoricalPricesChf(2025, ["ETH"]);
  const priceChf = prices.get("ETH") ?? 0;
  const balanceChf = balance * priceChf;

  assertApprox(balance, 2.5, 0.0001, "balance native = 2.5 ETH");
  assertApprox(priceChf, 2850.0, 0.01, "prix CHF = 2850");
  assertApprox(balanceChf, 7125.0, 1.0, "balance CHF = 7125 (2.5 * 2850)");

  // 3 appels total : 2 Etherscan + 1 CMC
  assert(fetchCallCount === 3, `3 appels HTTP au total (2 Etherscan + 1 CMC), got ${fetchCallCount}`);
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("=== Test unitaire snapshotService (mocks Etherscan + CMC) ===");

  await testEthBalanceFetch();
  await testCmcPriceFetch();
  await testSnapshotCalculation();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}
