/**
 * CoinMarketCap client — prix CHF historiques au 31.12
 *
 * Règle absolue : 1 seul appel batch multi-symbols par snapshot annuel.
 * Endpoint : /v2/cryptocurrency/quotes/historical?symbol=ETH,BTC,SOL&time_end=...&convert=CHF
 *
 * Retry x3 avec backoff exponentiel : 10s, 60s, 300s.
 */

import { config as _config } from "../../config/index.js";

export type CryptoSymbol = "ETH" | "BTC" | "SOL";

export interface CmcPriceResult {
  symbol: CryptoSymbol;
  priceChf: number;
  timestamp: string;
}

const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches CHF prices for ETH, BTC, SOL at 31.12 of the given year.
 * Makes a SINGLE batch request for all symbols.
 *
 * @param year - Fiscal year (e.g., 2025 → prix au 2025-12-31T23:59:59Z)
 * @param symbols - Array of crypto symbols to fetch (default: ETH, BTC, SOL)
 */
export async function fetchHistoricalPricesChf(
  year: number,
  symbols: CryptoSymbol[] = ["ETH", "BTC", "SOL"],
): Promise<Map<CryptoSymbol, number>> {
  // Lit process.env directement pour permettre le mock en tests (config évalué à l'import)
  const apiKey = process.env.CMC_API_KEY ?? _config.CMC_API_KEY;
  if (!apiKey) {
    throw new Error("CMC_API_KEY not configured");
  }

  const timeEnd = `${year}-12-31T23:59:59.000Z`;
  const symbolsParam = symbols.join(",");

  const url = new URL(`${CMC_BASE_URL}/v2/cryptocurrency/quotes/historical`);
  url.searchParams.set("symbol", symbolsParam);
  url.searchParams.set("time_end", timeEnd);
  url.searchParams.set("count", "1");
  url.searchParams.set("convert", "CHF");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!;
      console.warn(`[CMC] retry ${attempt}/${RETRY_DELAYS_MS.length} after ${delay}ms`);
      await sleep(delay);
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "X-CMC_PRO_API_KEY": apiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`CMC HTTP ${response.status}: ${body}`);
      }

      const json = (await response.json()) as CmcHistoricalResponse;
      return parseCmcResponse(json, symbols, year);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[CMC] attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("CMC fetch failed after retries");
}

// ── Types CMC API response ────────────────────────────────────────────────────

interface CmcHistoricalQuote {
  price: number;
  timestamp: string;
}

interface CmcHistoricalData {
  quotes: Array<{ quote: { CHF: CmcHistoricalQuote } }>;
}

interface CmcHistoricalResponse {
  data: Record<string, CmcHistoricalData[]>;
  status: { error_code: number; error_message: string | null };
}

function parseCmcResponse(
  json: CmcHistoricalResponse,
  symbols: CryptoSymbol[],
  year: number,
): Map<CryptoSymbol, number> {
  if (json.status.error_code !== 0) {
    throw new Error(`CMC API error: ${json.status.error_message}`);
  }

  const result = new Map<CryptoSymbol, number>();

  for (const symbol of symbols) {
    const entries = json.data[symbol];
    if (!entries || entries.length === 0) {
      throw new Error(`CMC: no data for symbol ${symbol} at year ${year}`);
    }

    const entry = entries[0];
    if (!entry) {
      throw new Error(`CMC: empty entry for symbol ${symbol}`);
    }

    const quotes = entry.quotes;
    if (!quotes || quotes.length === 0) {
      throw new Error(`CMC: no quotes for symbol ${symbol}`);
    }

    const quote = quotes[quotes.length - 1];
    if (!quote) {
      throw new Error(`CMC: no last quote for symbol ${symbol}`);
    }

    const price = quote.quote.CHF.price;
    if (typeof price !== "number" || isNaN(price)) {
      throw new Error(`CMC: invalid price for ${symbol}: ${price}`);
    }

    result.set(symbol, price);
  }

  return result;
}
