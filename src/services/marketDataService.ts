import { ApiFailureError, InvalidTickerError, RateLimitError } from "../errors.js";
import { getMarketDataApiKey } from "../config.js";
import type { DailyPricePoint, StockQuote, TickerOverview } from "../types.js";
import { getCurrentTradingDayRange, toUnixSeconds } from "./tradingWeek.js";
import { resolveTicker } from "./tickerResolver.js";

const API_BASE_URL = "https://finnhub.io/api/v1";
const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const QUOTE_TTL_MS = 60 * 1000;
const OVERVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const CANDLE_TTL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const quoteCache = new Map<string, CacheEntry<StockQuote>>();
const overviewCache = new Map<string, CacheEntry<TickerOverview>>();
const candleCache = new Map<string, CacheEntry<DailyPricePoint[]>>();

export async function getQuote(input: string): Promise<StockQuote> {
  const ticker = resolveTicker(input);

  return readThroughCache(quoteCache, ticker, QUOTE_TTL_MS, async () => {
    const data = await fetchFinnhub("/quote", {
      symbol: ticker
    });

    const price = parseCurrentPrice(data.c);

    if (price <= 0) {
      throw new InvalidTickerError(ticker);
    }

    const change = parseOptionalMarketNumber(data.d, 0);
    const changePercent = parseOptionalMarketNumber(data.dp, 0);
    const previousClose = parseOptionalMarketNumber(data.pc, price - change);

    return {
      symbol: ticker,
      price,
      change,
      changePercent,
      previousClose
    };
  });
}

export async function getTickerOverview(input: string): Promise<TickerOverview> {
  const ticker = resolveTicker(input);

  return readThroughCache(overviewCache, ticker, OVERVIEW_TTL_MS, async () => {
    const data = await fetchFinnhub("/stock/profile2", {
      symbol: ticker
    });

    return {
      symbol: stringOrUndefined(data.ticker)?.toUpperCase() ?? ticker,
      name: stringOrUndefined(data.name) ?? ticker,
      exchange: stringOrUndefined(data.exchange),
      currency: stringOrUndefined(data.currency),
      logo: stringOrUndefined(data.logo)
    };
  });
}

export async function getDailyPricePoints(input: string): Promise<DailyPricePoint[]> {
  const ticker = resolveTicker(input);
  const day = getCurrentTradingDayRange();
  const cacheKey = `${ticker}:${toUnixSeconds(day.start)}`;

  return readThroughCache(candleCache, cacheKey, CANDLE_TTL_MS, async () => {
    try {
      const data = await fetchFinnhub("/stock/candle", {
        symbol: ticker,
        resolution: "5",
        from: toUnixSeconds(day.start),
        to: toUnixSeconds(day.end)
      });

      const points = parseCandlePoints(data);

      if (points.length >= 2) {
        return points;
      }
    } catch {
      // Finnhub candles can be unavailable on some plans. Quotes still validate the ticker.
    }

    return fetchYahooDailyPricePoints(ticker);
  });
}

async function readThroughCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await loader();
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });

  return value;
}

async function fetchFinnhub(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE_URL}${path}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("token", getMarketDataApiKey());

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Simonbot/0.1"
      }
    });

    if (response.status === 429) {
      throw new RateLimitError();
    }

    if (!response.ok) {
      throw new ApiFailureError(`Market data provider returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as unknown;

    if (!isRecord(data)) {
      throw new ApiFailureError("Market data provider returned an unexpected payload.");
    }

    detectProviderError(data);

    return data;
  } catch (error) {
    if (error instanceof ApiFailureError || error instanceof RateLimitError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiFailureError("Market data provider request timed out.");
    }

    throw new ApiFailureError();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooDailyPricePoints(ticker: string): Promise<DailyPricePoint[]> {
  const url = new URL(`${YAHOO_CHART_BASE_URL}/${encodeURIComponent(ticker)}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "5m");
  url.searchParams.set("includePrePost", "false");

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Simonbot/0.1"
      }
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as unknown;

    return parseYahooChartPoints(data);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function detectProviderError(data: Record<string, unknown>): void {
  const errorMessage = stringOrUndefined(data.error);

  if (!errorMessage) {
    return;
  }

  if (/limit|rate|too many/i.test(errorMessage)) {
    throw new RateLimitError();
  }

  throw new ApiFailureError(errorMessage);
}

function parseCurrentPrice(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return numberValue;
}

function parseOptionalMarketNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return numberValue;
}

function parseCandlePoints(data: Record<string, unknown>): DailyPricePoint[] {
  if (data.s === "no_data") {
    return [];
  }

  if (!Array.isArray(data.c) || !Array.isArray(data.t)) {
    return [];
  }

  const points: DailyPricePoint[] = [];
  const length = Math.min(data.c.length, data.t.length);
  const opens = Array.isArray(data.o) ? data.o : [];
  const volumes = Array.isArray(data.v) ? data.v : [];

  for (let index = 0; index < length; index += 1) {
    const price = Number(index === 0 && opens[index] != null ? opens[index] : data.c[index]);
    const timestamp = Number(data.t[index]);
    const volume = Number(volumes[index]);

    if (Number.isFinite(price) && price > 0 && Number.isFinite(timestamp) && timestamp > 0) {
      points.push({
        price,
        timestamp: new Date(timestamp * 1000),
        volume: Number.isFinite(volume) && volume > 0 ? volume : undefined
      });
    }
  }

  return points;
}

function parseYahooChartPoints(data: unknown): DailyPricePoint[] {
  if (!isRecord(data) || !isRecord(data.chart)) {
    return [];
  }

  const result = Array.isArray(data.chart.result) ? data.chart.result[0] : null;

  if (!isRecord(result) || !Array.isArray(result.timestamp) || !isRecord(result.indicators)) {
    return [];
  }

  const quotes = Array.isArray(result.indicators.quote) ? result.indicators.quote : [];
  const firstQuote = quotes[0];

  if (!isRecord(firstQuote) || !Array.isArray(firstQuote.close)) {
    return [];
  }

  const points: DailyPricePoint[] = [];
  const length = Math.min(result.timestamp.length, firstQuote.close.length);
  const opens = Array.isArray(firstQuote.open) ? firstQuote.open : [];
  const volumes = Array.isArray(firstQuote.volume) ? firstQuote.volume : [];

  for (let index = 0; index < length; index += 1) {
    const timestamp = Number(result.timestamp[index]);
    const price = Number(index === 0 && opens[index] != null ? opens[index] : firstQuote.close[index]);
    const volume = Number(volumes[index]);

    if (Number.isFinite(price) && price > 0 && Number.isFinite(timestamp) && timestamp > 0) {
      points.push({
        price,
        timestamp: new Date(timestamp * 1000),
        volume: Number.isFinite(volume) && volume > 0 ? volume : undefined
      });
    }
  }

  return points;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
