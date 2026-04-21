/**
 * Test d'intégration E2E mockable — crypto wallets + snapshot
 *
 * Scénario : add wallet → refresh → query snapshot
 * Simule les appels API + DB avec des mocks en mémoire.
 *
 * Usage: tsx src/scripts/test-crypto-e2e.ts
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

process.env.CMC_API_KEY = "test-mock-key";
process.env.ETHERSCAN_API_KEY = "test-etherscan-key";

// Mock DB en mémoire
const mockWallets: Map<string, {
  id: string;
  tenant_id: string;
  user_id: string;
  chain: string;
  address: string;
  label: string | null;
  created_at: string;
}> = new Map();

const mockSnapshots: Map<string, {
  id: string;
  tenant_id: string;
  wallet_id: string;
  year: number;
  balance_native: number;
  balance_chf: number;
  price_chf_at_31_12: number;
  price_source: string;
  balance_source: string;
  snapshotted_at: string;
}> = new Map();

// Mock fetch pour les APIs externes
(global as unknown as { fetch: unknown }).fetch = async (url: string | URL): Promise<Response> => {
  const urlStr = url.toString();

  if (urlStr.includes("getblocknobytime")) {
    return makeJsonResponse({ status: "1", message: "OK", result: "20000000" });
  }
  if (urlStr.includes("module=account") && urlStr.includes("action=balance")) {
    // 1.5 ETH en Wei
    return makeJsonResponse({ status: "1", message: "OK", result: (1.5 * 1e18).toFixed(0) });
  }
  if (urlStr.includes("coinmarketcap.com")) {
    return makeJsonResponse({
      status: { error_code: 0, error_message: null },
      data: {
        ETH: [{ quotes: [{ quote: { CHF: { price: 3000.00 } } }] }],
      },
    });
  }

  throw new Error(`Unexpected fetch: ${urlStr}`);
};

// ── Simulation des routes API (logique pure sans Express) ─────────────────────

import { getEthBalance } from "../services/crypto/etherscan.js";
import { fetchHistoricalPricesChf } from "../services/crypto/coinmarketcap.js";
import { v4 as uuidv4 } from "uuid";

const TENANT_ID = "47eddb05-d46b-48cd-ad23-698cc30d1d89";
const USER_ID = "user-test-001";

// Simule POST /wallet
async function addWallet(chain: "eth" | "btc" | "sol", address: string, label?: string): Promise<string> {
  const key = `${TENANT_ID}:${chain}:${address}`;
  if (mockWallets.has(key)) {
    throw new Error("wallet already exists");
  }
  const id = uuidv4();
  mockWallets.set(key, { id, tenant_id: TENANT_ID, user_id: USER_ID, chain, address, label: label ?? null, created_at: new Date().toISOString() });
  return id;
}

// Simule POST /snapshot/refresh (synchrone dans le test)
async function refreshSnapshot(walletId: string, year: number): Promise<void> {
  const wallet = [...mockWallets.values()].find((w) => w.id === walletId);
  if (!wallet) throw new Error(`wallet ${walletId} not found`);

  const priceMap = await fetchHistoricalPricesChf(year, ["ETH"]);
  const priceChf = priceMap.get("ETH") ?? 0;
  const balanceNative = await getEthBalance(wallet.address, year);
  const balanceChf = balanceNative * priceChf;

  const snapshotKey = `${walletId}:${year}`;
  mockSnapshots.set(snapshotKey, {
    id: uuidv4(),
    tenant_id: TENANT_ID,
    wallet_id: walletId,
    year,
    balance_native: balanceNative,
    balance_chf: balanceChf,
    price_chf_at_31_12: priceChf,
    price_source: "coinmarketcap",
    balance_source: "etherscan",
    snapshotted_at: new Date().toISOString(),
  });
}

// Simule GET /snapshot?year=...
function querySnapshots(year: number): Array<{ wallet_id: string; chain: string; balance_chf: number }> {
  return [...mockSnapshots.values()]
    .filter((s) => s.year === year && s.tenant_id === TENANT_ID)
    .map((s) => {
      const wallet = [...mockWallets.values()].find((w) => w.id === s.wallet_id);
      return { wallet_id: s.wallet_id, chain: wallet?.chain ?? "unknown", balance_chf: s.balance_chf };
    });
}

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

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✓ ${message} (${actual.toFixed(2)})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} — expected ~${expected}, got ${actual}`);
    failed++;
  }
}

async function testE2E(): Promise<void> {
  console.log("\n[test] E2E: add wallet → refresh → query snapshot");

  // 1. Ajouter un wallet ETH
  const address = "0xabcdef1234567890abcdef1234567890abcdef12";
  const walletId = await addWallet("eth", address, "Wallet principal");
  assert(typeof walletId === "string" && walletId.length > 0, "wallet créé avec ID");

  // 2. Refresh snapshot 2025
  await refreshSnapshot(walletId, 2025);
  assert(mockSnapshots.size === 1, "1 snapshot créé");

  // 3. Query snapshots year 2025
  const snapshots = querySnapshots(2025);
  assert(snapshots.length === 1, "1 snapshot retourné pour year 2025");
  assert(snapshots[0]?.chain === "eth", "chain = eth");

  // 4. Vérifier les valeurs
  // 1.5 ETH * 3000 CHF = 4500 CHF
  assertApprox(snapshots[0]?.balance_chf ?? 0, 4500.0, 10.0, "balance CHF ≈ 4500 (1.5 ETH * 3000)");

  // 5. Idempotence : refresh une 2ème fois → pas de doublon
  await refreshSnapshot(walletId, 2025);
  const snapshotsAfter = querySnapshots(2025);
  assert(snapshotsAfter.length === 1, "idempotent: toujours 1 snapshot après double refresh");
  assert(mockSnapshots.size === 1, "idempotent: toujours 1 snapshot en DB");

  // 6. Total CHF
  const totalChf = snapshots.reduce((sum, s) => sum + s.balance_chf, 0);
  assertApprox(totalChf, 4500.0, 10.0, "total_chf ≈ 4500");
}

async function testMultipleWallets(): Promise<void> {
  console.log("\n[test] E2E: 2 wallets ETH → total CHF cumulé");

  mockWallets.clear();
  mockSnapshots.clear();

  const wallet1 = await addWallet("eth", "0x1111111111111111111111111111111111111111", "Wallet A");
  const wallet2 = await addWallet("eth", "0x2222222222222222222222222222222222222222", "Wallet B");

  await refreshSnapshot(wallet1, 2025);
  await refreshSnapshot(wallet2, 2025);

  const snapshots = querySnapshots(2025);
  assert(snapshots.length === 2, "2 snapshots pour 2 wallets");

  const totalChf = snapshots.reduce((sum, s) => sum + s.balance_chf, 0);
  // 2 * (1.5 ETH * 3000) = 9000 CHF
  assertApprox(totalChf, 9000.0, 20.0, "total_chf ≈ 9000 (2 wallets * 1.5 ETH * 3000)");
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("=== Test E2E crypto (mockable) ===");

  await testE2E();
  await testMultipleWallets();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();

function makeJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}
