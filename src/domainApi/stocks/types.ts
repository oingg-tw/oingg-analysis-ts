import type { ExDividendNoticeEntry } from '@/shared/sourceData/exDividendNotice';

export interface StockQuotePrice {
  tradeDate: string;
  close: number | null;
}

export interface StockQuoteValuation {
  tradeDate: string;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
}

export interface StockQuoteResult {
  symbol: string;
  price: StockQuotePrice | null;
  valuation: StockQuoteValuation | null;
}

export interface StockPricesResult {
  prices: Record<string, { close: number | null; tradeDate: string }>;
}

export interface ExDividendNoticesResult {
  notices: Record<string, ExDividendNoticeEntry[]>;
}
