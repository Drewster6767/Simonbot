import { ApiFailureError, SimonbotError } from "../errors.js";
import type { MarketMover, MarketMoverKind, TickerOverview } from "../types.js";
import { getQuote, getTickerOverview } from "./marketDataService.js";
import { resolveTicker } from "./tickerResolver.js";

const MOVERS_TTL_MS = 60 * 1000;
const QUOTE_CONCURRENCY = 6;
const DEFAULT_MOVER_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "GOOG",
  "TSLA",
  "AVGO",
  "AMD",
  "NFLX",
  "COST",
  "LLY",
  "UNH",
  "JPM",
  "V",
  "MA",
  "WMT",
  "XOM",
  "HD",
  "PG",
  "JNJ",
  "ABBV",
  "MRK",
  "KO",
  "PEP",
  "CRM",
  "ORCL",
  "ADBE",
  "CSCO",
  "QCOM",
  "TXN",
  "INTC",
  "MU",
  "AMAT",
  "SMCI",
  "PANW",
  "CRWD",
  "NOW",
  "SHOP",
  "UBER",
  "ABNB",
  "DIS",
  "NKE",
  "MCD",
  "COIN",
  "PLTR",
  "SNOW",
  "ROKU",
  "SOFI"
];

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const moversCache = new Map<MarketMoverKind, CacheEntry<MarketMover[]>>();

export async function getMarketMovers(kind: MarketMoverKind): Promise<MarketMover[]> {
  const cached = moversCache.get(kind);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const symbols = getMoverUniverse();
  const quotes = await mapWithConcurrency(symbols, QUOTE_CONCURRENCY, async (symbol) => {
    try {
      return await getQuote(symbol);
    } catch (error) {
      if (error instanceof SimonbotError && error.code === "INVALID_TICKER") {
        return null;
      }

      throw error;
    }
  });

  const rankedQuotes = quotes
    .filter((quote): quote is NonNullable<typeof quote> => quote !== null)
    .sort((a, b) =>
      kind === "hot" ? b.changePercent - a.changePercent : a.changePercent - b.changePercent
    )
    .slice(0, 5);

  if (rankedQuotes.length === 0) {
    throw new ApiFailureError("No mover quotes were available.");
  }

  const movers = await Promise.all(
    rankedQuotes.map(async (quote) => {
      const overview = await getOverviewFallback(quote.symbol);

      return {
        symbol: quote.symbol,
        name: overview.name,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        currency: overview.currency,
        logo: overview.logo
      };
    })
  );

  moversCache.set(kind, {
    value: movers,
    expiresAt: Date.now() + MOVERS_TTL_MS
  });

  return movers;
}

function getMoverUniverse(): string[] {
  const configured = process.env.MARKET_MOVER_SYMBOLS?.trim();
  const configuredSymbols = configured ? configured.split(",") : DEFAULT_MOVER_SYMBOLS;
  const symbols = configuredSymbols
    .map((symbol) => {
      try {
        return resolveTicker(symbol);
      } catch {
        return null;
      }
    })
    .filter((symbol): symbol is string => symbol !== null);

  return Array.from(new Set(symbols));
}

async function getOverviewFallback(symbol: string): Promise<TickerOverview> {
  try {
    return await getTickerOverview(symbol);
  } catch {
    return {
      symbol,
      name: symbol,
      currency: "USD"
    };
  }
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}
