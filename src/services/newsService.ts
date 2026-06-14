import { ApiFailureError, RateLimitError } from "../errors.js";
import { getMarketDataApiKey } from "../config.js";
import type { NewsArticle } from "../types.js";
import { formatFinnhubDate, getCurrentTradingWeek } from "./tradingWeek.js";
import { resolveTicker } from "./tickerResolver.js";

const API_BASE_URL = "https://finnhub.io/api/v1";
const NEWS_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const newsCache = new Map<string, CacheEntry<NewsArticle[]>>();

export async function getRecentNews(input: string): Promise<NewsArticle[]> {
  const ticker = resolveTicker(input);

  return readThroughCache(newsCache, ticker, NEWS_TTL_MS, async () => {
    const week = getCurrentTradingWeek();
    const data = await fetchFinnhubNews({
      symbol: ticker,
      from: formatFinnhubDate(week.start),
      to: formatFinnhubDate(week.end)
    });

    return data
      .map(toNewsArticle)
      .filter((article): article is NewsArticle => article !== null)
      .filter((article) => article.publishedAt >= week.start && article.publishedAt <= week.end)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 4);
  });
}

export async function getRecentCryptoNews(
  symbol: string,
  displayName: string,
  coinGeckoId: string
): Promise<NewsArticle[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cacheKey = `crypto:${normalizedSymbol}:${coinGeckoId}`;

  return readThroughCache(newsCache, cacheKey, NEWS_TTL_MS, async () => {
    const earliest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const data = await fetchFinnhubMarketNews("crypto");

    return data
      .filter((item) => matchesCryptoNews(item, normalizedSymbol, displayName, coinGeckoId))
      .map(toNewsArticle)
      .filter((article): article is NewsArticle => article !== null)
      .filter((article) => article.publishedAt >= earliest)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 4);
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

async function fetchFinnhubNews(params: Record<string, string>): Promise<unknown[]> {
  return fetchFinnhubArray("/company-news", params);
}

async function fetchFinnhubMarketNews(category: string): Promise<unknown[]> {
  return fetchFinnhubArray("/news", { category });
}

async function fetchFinnhubArray(path: string, params: Record<string, string>): Promise<unknown[]> {
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

    if (Array.isArray(data)) {
      return data;
    }

    if (isRecord(data)) {
      detectProviderError(data);
    }

    throw new ApiFailureError("Market data provider returned an unexpected payload.");
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

function matchesCryptoNews(
  value: unknown,
  symbol: string,
  displayName: string,
  coinGeckoId: string
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const haystack = [value.headline, value.summary, value.related]
    .map((entry) => (typeof entry === "string" ? entry : ""))
    .join(" ")
    .toLowerCase();
  const terms = [
    symbol,
    displayName,
    coinGeckoId.replace(/-/g, " ")
  ]
    .map((term) => term.trim().toLowerCase())
    .filter((term, index, allTerms) => term && allTerms.indexOf(term) === index);

  return terms.some((term) => containsSearchTerm(haystack, term));
}

function containsSearchTerm(haystack: string, term: string): boolean {
  if (term.length <= 5 && /^[a-z0-9]+$/.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`).test(haystack);
  }

  return haystack.includes(term);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function toNewsArticle(value: unknown): NewsArticle | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = stringOrUndefined(value.headline);
  const url = stringOrUndefined(value.url);
  const publisher = stringOrUndefined(value.source) ?? "Unknown publisher";
  const publishedAt = parseFinnhubTimestamp(value.datetime);

  if (!title || !url || !publishedAt) {
    return null;
  }

  return {
    title,
    url,
    publisher,
    publishedAt,
    imageUrl: stringOrUndefined(value.image),
    summary: stringOrUndefined(value.summary)
  };
}

function parseFinnhubTimestamp(value: unknown): Date | null {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp * 1000);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
