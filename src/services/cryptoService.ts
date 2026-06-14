import { ApiFailureError, InvalidCryptoSymbolError, RateLimitError } from "../errors.js";
import { getCoinGeckoApiKey } from "../config.js";
import type { CryptoQuote, DailyPricePoint } from "../types.js";

const API_BASE_URL = "https://api.coingecko.com/api/v3";
const CRYPTO_QUOTE_TTL_MS = 45 * 1000;
const CRYPTO_METADATA_TTL_MS = 24 * 60 * 60 * 1000;
const CRYPTO_CHART_TTL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

interface CryptoMetadata {
  symbol: string;
  coinGeckoId: string;
  displayName: string;
  imageUrl?: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const PREFERRED_CRYPTO: Record<string, CryptoMetadata> = {
  BTC: { symbol: "BTC", coinGeckoId: "bitcoin", displayName: "Bitcoin" },
  ETH: { symbol: "ETH", coinGeckoId: "ethereum", displayName: "Ethereum" },
  SOL: { symbol: "SOL", coinGeckoId: "solana", displayName: "Solana" },
  DOGE: { symbol: "DOGE", coinGeckoId: "dogecoin", displayName: "Dogecoin" },
  XRP: { symbol: "XRP", coinGeckoId: "ripple", displayName: "XRP" },
  ADA: { symbol: "ADA", coinGeckoId: "cardano", displayName: "Cardano" },
  AVAX: { symbol: "AVAX", coinGeckoId: "avalanche-2", displayName: "Avalanche" },
  LINK: { symbol: "LINK", coinGeckoId: "chainlink", displayName: "Chainlink" },
  BNB: { symbol: "BNB", coinGeckoId: "binancecoin", displayName: "BNB" },
  LTC: { symbol: "LTC", coinGeckoId: "litecoin", displayName: "Litecoin" },
  BCH: { symbol: "BCH", coinGeckoId: "bitcoin-cash", displayName: "Bitcoin Cash" },
  DOT: { symbol: "DOT", coinGeckoId: "polkadot", displayName: "Polkadot" },
  TRX: { symbol: "TRX", coinGeckoId: "tron", displayName: "TRON" },
  SHIB: { symbol: "SHIB", coinGeckoId: "shiba-inu", displayName: "Shiba Inu" },
  PEPE: { symbol: "PEPE", coinGeckoId: "pepe", displayName: "Pepe" }
};

const quoteCache = new Map<string, CacheEntry<CryptoQuote>>();
const metadataCache = new Map<string, CacheEntry<CryptoMetadata>>();
const chartCache = new Map<string, CacheEntry<DailyPricePoint[]>>();

export async function getCryptoQuote(input: string): Promise<CryptoQuote> {
  const symbol = normalizeCryptoInput(input);
  const metadata = await resolveCryptoMetadata(symbol);
  const cached = quoteCache.get(metadata.coinGeckoId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [data, imageUrl] = await Promise.all([
    fetchCoinGeckoSimplePrice(metadata.coinGeckoId),
    getCryptoImageUrl(metadata).catch(() => metadata.imageUrl)
  ]);
  const coinData = data[metadata.coinGeckoId];

  if (!isRecord(coinData)) {
    throw new ApiFailureError("CoinGecko returned missing crypto price data.");
  }

  const priceUsd = parseFiniteNumber(coinData.usd);
  const changePercent24h = parseFiniteNumber(coinData.usd_24h_change);
  const denominator = 1 + changePercent24h / 100;

  if (priceUsd <= 0 || denominator <= 0) {
    throw new ApiFailureError("CoinGecko returned invalid crypto price data.");
  }

  const previousPrice = priceUsd / denominator;
  const quote: CryptoQuote = {
    symbol: metadata.symbol,
    coinGeckoId: metadata.coinGeckoId,
    displayName: metadata.displayName,
    priceUsd,
    changePercent24h,
    changeUsd24h: priceUsd - previousPrice,
    lastUpdatedAt: parseUnixTimestamp(coinData.last_updated_at),
    imageUrl
  };

  quoteCache.set(metadata.coinGeckoId, {
    value: quote,
    expiresAt: Date.now() + CRYPTO_QUOTE_TTL_MS
  });

  return quote;
}

export async function getCryptoPricePoints(coinGeckoId: string): Promise<DailyPricePoint[]> {
  const normalizedCoinGeckoId = coinGeckoId.trim();

  if (!normalizedCoinGeckoId) {
    return [];
  }

  const cached = chartCache.get(normalizedCoinGeckoId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const data = await fetchCoinGeckoMarketChart(normalizedCoinGeckoId);
  const points = parseMarketChartPoints(data);

  chartCache.set(normalizedCoinGeckoId, {
    value: points,
    expiresAt: Date.now() + CRYPTO_CHART_TTL_MS
  });

  return points;
}

function normalizeCryptoInput(input: string): string {
  const symbol = input.trim().replace(/^\$/, "").toUpperCase();

  if (!symbol || !/^[A-Z0-9.-]{1,20}$/.test(symbol)) {
    throw new InvalidCryptoSymbolError(input);
  }

  return symbol;
}

async function resolveCryptoMetadata(symbol: string): Promise<CryptoMetadata> {
  const cached = metadataCache.get(symbol);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const preferredMetadata = PREFERRED_CRYPTO[symbol];

  if (preferredMetadata) {
    return preferredMetadata;
  }

  const metadata = await searchCoinGeckoSymbol(symbol);

  metadataCache.set(symbol, {
    value: metadata,
    expiresAt: Date.now() + CRYPTO_METADATA_TTL_MS
  });

  return metadata;
}

async function searchCoinGeckoSymbol(symbol: string): Promise<CryptoMetadata> {
  const data = await fetchCoinGeckoSearch(symbol);
  const coins = Array.isArray(data.coins) ? data.coins : [];
  const exactMatches = coins
    .filter(isRecord)
    .filter((coin) => stringOrUndefined(coin.symbol)?.toUpperCase() === symbol)
    .sort((a, b) => getMarketCapRank(a) - getMarketCapRank(b));
  const bestMatch = exactMatches[0];
  const coinGeckoId = bestMatch ? stringOrUndefined(bestMatch.id) : undefined;
  const displayName = bestMatch ? stringOrUndefined(bestMatch.name) : undefined;

  if (!coinGeckoId || !displayName) {
    throw new InvalidCryptoSymbolError(symbol);
  }

  return {
    symbol,
    coinGeckoId,
    displayName,
    imageUrl: bestMatch
      ? stringOrUndefined(bestMatch.large) ?? stringOrUndefined(bestMatch.thumb)
      : undefined
  };
}

async function fetchCoinGeckoSimplePrice(coinGeckoId: string): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE_URL}/simple/price`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    "User-Agent": "Simonbot/0.1"
  };
  const apiKey = getCoinGeckoApiKey();

  url.searchParams.set("ids", coinGeckoId);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_last_updated_at", "true");

  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey;
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers
    });

    if (response.status === 429) {
      throw new RateLimitError();
    }

    if (!response.ok) {
      throw new ApiFailureError(`CoinGecko returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as unknown;

    if (!isRecord(data)) {
      throw new ApiFailureError("CoinGecko returned an unexpected payload.");
    }

    return data;
  } catch (error) {
    if (error instanceof ApiFailureError || error instanceof RateLimitError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiFailureError("CoinGecko request timed out.");
    }

    throw new ApiFailureError("CoinGecko request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoinGeckoSearch(query: string): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE_URL}/search`);

  url.searchParams.set("query", query);

  return fetchCoinGeckoJson(url);
}

async function fetchCoinGeckoMarketChart(coinGeckoId: string): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE_URL}/coins/${encodeURIComponent(coinGeckoId)}/market_chart`);

  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", "1");
  url.searchParams.set("precision", "full");

  return fetchCoinGeckoJson(url);
}

async function fetchCoinGeckoCoinDetails(coinGeckoId: string): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE_URL}/coins/${encodeURIComponent(coinGeckoId)}`);

  url.searchParams.set("localization", "false");
  url.searchParams.set("tickers", "false");
  url.searchParams.set("market_data", "false");
  url.searchParams.set("community_data", "false");
  url.searchParams.set("developer_data", "false");
  url.searchParams.set("sparkline", "false");

  return fetchCoinGeckoJson(url);
}

async function fetchCoinGeckoJson(url: URL): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    "User-Agent": "Simonbot/0.1"
  };
  const apiKey = getCoinGeckoApiKey();

  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey;
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers
    });

    if (response.status === 429) {
      throw new RateLimitError();
    }

    if (!response.ok) {
      throw new ApiFailureError(`CoinGecko returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as unknown;

    if (!isRecord(data)) {
      throw new ApiFailureError("CoinGecko returned an unexpected payload.");
    }

    return data;
  } catch (error) {
    if (error instanceof ApiFailureError || error instanceof RateLimitError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiFailureError("CoinGecko request timed out.");
    }

    throw new ApiFailureError("CoinGecko request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function getCryptoImageUrl(metadata: CryptoMetadata): Promise<string | undefined> {
  if (metadata.imageUrl) {
    return metadata.imageUrl;
  }

  const data = await fetchCoinGeckoCoinDetails(metadata.coinGeckoId);
  const imageUrl = parseCoinImageUrl(data);

  if (imageUrl) {
    metadataCache.set(metadata.symbol, {
      value: {
        ...metadata,
        imageUrl
      },
      expiresAt: Date.now() + CRYPTO_METADATA_TTL_MS
    });
  }

  return imageUrl;
}

function parseMarketChartPoints(data: Record<string, unknown>): DailyPricePoint[] {
  const prices = Array.isArray(data.prices) ? data.prices : [];
  const volumes = Array.isArray(data.total_volumes) ? data.total_volumes : [];
  const points: DailyPricePoint[] = [];

  for (let index = 0; index < prices.length; index += 1) {
    const priceEntry = prices[index];
    const volumeEntry = volumes[index];

    if (!Array.isArray(priceEntry)) {
      continue;
    }

    const timestamp = Number(priceEntry[0]);
    const price = Number(priceEntry[1]);
    const volume =
      Array.isArray(volumeEntry) && Number.isFinite(Number(volumeEntry[1]))
        ? Number(volumeEntry[1])
        : undefined;

    if (Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(price) && price > 0) {
      points.push({
        timestamp: new Date(timestamp),
        price,
        volume: volume && volume > 0 ? volume : undefined
      });
    }
  }

  return points.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function parseCoinImageUrl(data: Record<string, unknown>): string | undefined {
  if (!isRecord(data.image)) {
    return undefined;
  }

  return (
    stringOrUndefined(data.image.large) ??
    stringOrUndefined(data.image.small) ??
    stringOrUndefined(data.image.thumb)
  );
}

function parseFiniteNumber(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new ApiFailureError("CoinGecko returned invalid crypto price data.");
  }

  return numberValue;
}

function parseUnixTimestamp(value: unknown): Date | undefined {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }

  return new Date(timestamp * 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getMarketCapRank(coin: Record<string, unknown>): number {
  const rank = Number(coin.market_cap_rank);

  return Number.isFinite(rank) && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}
