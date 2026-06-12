export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  latestTradingDay?: string;
}

export interface TickerOverview {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  logo?: string;
}

export interface NewsArticle {
  title: string;
  url: string;
  publisher: string;
  publishedAt: Date;
  imageUrl?: string;
  summary?: string;
}

export interface DailyPricePoint {
  timestamp: Date;
  price: number;
  volume?: number;
}

export type MarketMoverKind = "hot" | "not";

export interface MarketMover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency?: string;
  logo?: string;
}
