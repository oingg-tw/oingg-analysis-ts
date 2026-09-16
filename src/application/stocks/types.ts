import type { DailyPriceHistoryEntry, ExDividendCalendarEntry, ExDividendNoticeEntry, ForeignShareholdingEntry, StockPledgeRatioEntry } from '@/application/ports/marketData';

// GET /stocks/* 回應的形狀（application 真理來源）——http/modules/stocks/types.ts 的 zod schema 用
// `satisfies z.ZodType<...>` 釘住，兩邊不會漂。

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

export interface StockSummaryChange {
  amount: number | null;
  percent: number | null;
}

export interface StockSummaryPrice {
  tradeDate: string;
  close: number | null;
  volume: number | null;
  change: StockSummaryChange | null;
}

export interface StockSummaryMarketCap {
  tradeDate: string;
  value: number | null;
}

export interface StockSummaryResult {
  symbol: string;
  price: StockSummaryPrice | null;
  valuation: StockQuoteValuation | null;
  marketCap: StockSummaryMarketCap | null;
}

export interface StockPricesResult {
  prices: Record<string, { close: number | null; tradeDate: string }>;
}

export interface ExDividendNoticesResult {
  notices: Record<string, ExDividendNoticeEntry[]>;
}

export interface ExDividendCalendarResult {
  entries: (ExDividendCalendarEntry & { companyName: string | null })[];
}

export interface ForeignShareholdingHistoryResult {
  symbol: string;
  entries: ForeignShareholdingEntry[];
}

export interface StockPledgeRatioHistoryResult {
  symbol: string;
  entries: StockPledgeRatioEntry[];
}

export interface DailyPriceHistoryResult {
  symbol: string;
  entries: DailyPriceHistoryEntry[];
  earliestAvailableTradeDate: string | null;
}
