// twse-ts/tpex-ts 各種「市場清單」export view 的 port——GET /market/* 的 11 支端點在用。回傳原始列形狀
// （snake_case、bigint/Decimal 原樣），Number()/toString() 轉換維持在 use case（跟 Phase 2 搬家時的分工一致）。
// 實作在 infrastructure/repositories/exchange/marketLists.ts（依 market 選 twse/tpex 的 export DB）。

export type Market = 'TWSE' | 'TPEx';

// ---- 成交量前 20（export.volume_top20）
export interface RawTwseVolumeTop20Row {
  symbol: string;
  volume: bigint;
  transaction: bigint;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  dir: string | null;
  change: number | null;
}

export interface RawTpexVolumeTop20Row {
  symbol: string;
  volume: bigint;
}

// ---- 漲跌停幅度（export.price_limit_range）
export interface RawTwsePriceLimitRangeRow {
  symbol: string;
  rank_group: string;
  limit_up: number | null;
  limit_down: number | null;
  limit_range: number | null;
  opening_ref_price: number | null;
  previous_day_price: number | null;
  allow_odd_lot_trade: string | null;
}

export interface RawTpexPriceLimitRangeRow {
  symbol: string;
  rank_group: string;
  limit_up: number | null;
  limit_down: number | null;
  limit_range: number | null;
}

// ---- 月營收（export.monthly_revenue，twse-ts/tpex-ts 欄位一致）
export interface RawMonthlyRevenueRow {
  symbol: string;
  year_month: Date;
  current_month_revenue: bigint | null;
  mom_change_percent: number | null;
  yoy_change_percent: number | null;
}

// ---- 融資融券餘額（export.margin_balance，兩邊欄位一致）
export interface RawMarginBalanceRow {
  symbol: string;
  margin_today_balance: bigint | null;
  short_today_balance: bigint | null;
}

// ---- 注意股票（export.attention_history_note）
export interface RawAttentionHistoryNoteRow {
  symbol: string;
  trade_date: Date;
  criteria: string | null;
}

// ---- 處置股票（export.disposed_stock）
export interface RawTwseDisposedStockRow {
  symbol: string;
  announce_date: Date;
  announcement_count: number | null;
  reason: string | null;
  disposition_period: string | null;
  disposition_measures: string | null;
  detail: string | null;
  link_information: string | null;
}

export interface RawTpexDisposedStockRow {
  symbol: string;
  announce_date: Date;
  reason: string | null;
  disposition_period: string | null;
  detail: string | null;
}

export interface MarketListsPort {
  getLatestVolumeTop20TradeDate(market: Market): Promise<Date | null>;
  listVolumeTop20Twse(tradeDate: Date): Promise<RawTwseVolumeTop20Row[]>;
  listVolumeTop20Tpex(tradeDate: Date): Promise<RawTpexVolumeTop20Row[]>;
  getLatestPriceLimitRangeTradeDate(market: Market): Promise<Date | null>;
  listPriceLimitRangeTwse(tradeDate: Date): Promise<RawTwsePriceLimitRangeRow[]>;
  listPriceLimitRangeTpex(tradeDate: Date): Promise<RawTpexPriceLimitRangeRow[]>;
  getLatestMonthlyRevenueYearMonth(market: Market): Promise<Date | null>;
  listMonthlyRevenueForMonth(market: Market, yearMonth: Date): Promise<RawMonthlyRevenueRow[]>;
  getLatestMarginBalanceTradeDate(market: Market): Promise<Date | null>;
  // 融資餘額是 0 或 null 時無法算券資比（分母不能是 0），repository 直接在 SQL 排除。
  listMarginBalanceForRatio(market: Market, tradeDate: Date): Promise<RawMarginBalanceRow[]>;
  // 最近兩個交易日 [最新, 前一個]；不足兩天回 null。
  getLatestTwoTradeDates(market: Market): Promise<[Date, Date] | null>;
  listClosesForDate(market: Market, tradeDate: Date): Promise<{ symbol: string; close: number | null }[]>;
  // TWSE 由呼叫端先用 companyProfiles.getSecuritySymbolSet 取得清單再帶進來（twse export DB 查不到 company_profile）；
  // TPEx 的 export schema 本身有 company_profile 可以直接子查詢。
  listAttentionNotesTwse(eligibleSymbols: string[], limit: number): Promise<RawAttentionHistoryNoteRow[]>;
  listAttentionNotesTpex(limit: number): Promise<RawAttentionHistoryNoteRow[]>;
  listDisposedStocksTwse(eligibleSymbols: string[], limit: number): Promise<RawTwseDisposedStockRow[]>;
  listDisposedStocksTpex(limit: number): Promise<RawTpexDisposedStockRow[]>;
}
