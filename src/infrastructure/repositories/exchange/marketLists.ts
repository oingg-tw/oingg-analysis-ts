import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import type { MarketListsPort } from '@/application/ports/marketLists';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';

// 2026-09-17 clean architecture 重構 Phase 2：全市場排行/清單類端點（market/*）原本各自在 HTTP
// 層的 service.ts 內嵌 raw SQL 直接打 twse-ts/tpex-ts 的 export view——SQL 逐字搬到這裡，
// service 只留「合併兩個市場、排序、補公司名稱」的編排邏輯。回傳的仍是 $queryRaw 的原始列
// 形狀（Date / bigint / Decimal 物件），數值轉換維持在呼叫端，這一步只是搬家不改行為。
//
// 上市（twse-ts）跟上櫃（tpex-ts）是兩個獨立的 Neon 專案、兩個不同的 Prisma client 型別；
// SQL 完全相同的查詢用 market 參數選 client（RawQueryable 只取 $queryRaw 這一個方法的結構型別，
// 避開兩個 generated client 的 union 不可呼叫的問題），欄位不同的查詢維持各自一支函式。

export type Market = 'TWSE' | 'TPEx';

interface RawQueryable {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

const dbFor = (market: Market): RawQueryable => (market === 'TWSE' ? twseExportPrisma : tpexExportPrisma) as unknown as RawQueryable;

// ---- 成交量前 20（export.volume_top20）----
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

export const getLatestVolumeTop20TradeDate = async (market: Market): Promise<Date | null> => {
  const rows = await dbFor(market).$queryRaw<{ trade_date: Date | null }[]>`SELECT MAX(trade_date) as trade_date FROM "export"."volume_top20"`;
  return rows[0]?.trade_date ?? null;
};

export const listVolumeTop20Twse = (tradeDate: Date): Promise<RawTwseVolumeTop20Row[]> =>
  twseExportPrisma.$queryRaw<RawTwseVolumeTop20Row[]>`
    SELECT symbol, volume, transaction, open, high, low, close, dir, change
    FROM "export"."volume_top20"
    WHERE trade_date = ${tradeDate}
  `;

export const listVolumeTop20Tpex = (tradeDate: Date): Promise<RawTpexVolumeTop20Row[]> =>
  tpexExportPrisma.$queryRaw<RawTpexVolumeTop20Row[]>`
    SELECT symbol, volume
    FROM "export"."volume_top20"
    WHERE trade_date = ${tradeDate}
  `;

// ---- 漲跌停幅度（export.price_limit_range）----
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

export const getLatestPriceLimitRangeTradeDate = async (market: Market): Promise<Date | null> => {
  const rows = await dbFor(market).$queryRaw<{ trade_date: Date | null }[]>`SELECT MAX(trade_date) as trade_date FROM "export"."price_limit_range"`;
  return rows[0]?.trade_date ?? null;
};

export const listPriceLimitRangeTwse = (tradeDate: Date): Promise<RawTwsePriceLimitRangeRow[]> =>
  twseExportPrisma.$queryRaw<RawTwsePriceLimitRangeRow[]>`
    SELECT symbol, rank_group, limit_up, limit_down, limit_range, opening_ref_price, previous_day_price, allow_odd_lot_trade
    FROM "export"."price_limit_range"
    WHERE trade_date = ${tradeDate}
  `;

export const listPriceLimitRangeTpex = (tradeDate: Date): Promise<RawTpexPriceLimitRangeRow[]> =>
  tpexExportPrisma.$queryRaw<RawTpexPriceLimitRangeRow[]>`
    SELECT symbol, rank_group, limit_up, limit_down, limit_range
    FROM "export"."price_limit_range"
    WHERE trade_date = ${tradeDate}
  `;

// ---- 月營收（export.monthly_revenue，twse-ts/tpex-ts 欄位一致）----
export interface RawMonthlyRevenueRow {
  symbol: string;
  year_month: Date;
  current_month_revenue: bigint | null;
  mom_change_percent: number | null;
  yoy_change_percent: number | null;
}

// 2026-09-23：twse 的 monthly_revenue 兩個來源共用一張表——`MONTHLY_REVENUE`（上市，2021-09~2026-08、
// 58,024 筆、993 家）與 `MONTHLY_REVENUE_PUBLIC`（公開發行未上市的證券商，2026-07 起 588 筆、301 家）。
// 不篩 source 的話這兩個月的月營收清單會混進 000104 這類六碼代號的非上市公司，跟 company_profile 那次
// 是同一類陷阱（見 companyProfile.ts 的 LISTED_ONLY）；MAX(year_month) 也會在 PUBLIC 領先時指到一個
// 只有 301 家的月份。**tpex 那張表沒有 source 欄位**（只有一個來源），所以照本檔開頭的慣例
// 「欄位不同的查詢維持各自一支」分兩邊寫，不用 dbFor。
export const getLatestMonthlyRevenueYearMonth = async (market: Market): Promise<Date | null> => {
  const rows =
    market === 'TWSE'
      ? await twseExportPrisma.$queryRaw<{ year_month: Date | null }[]>`SELECT MAX(year_month) as year_month FROM "export"."monthly_revenue" WHERE source = 'MONTHLY_REVENUE'`
      : await tpexExportPrisma.$queryRaw<{ year_month: Date | null }[]>`SELECT MAX(year_month) as year_month FROM "export"."monthly_revenue"`;
  return rows[0]?.year_month ?? null;
};

export const listMonthlyRevenueForMonth = (market: Market, yearMonth: Date): Promise<RawMonthlyRevenueRow[]> =>
  market === 'TWSE'
    ? twseExportPrisma.$queryRaw<RawMonthlyRevenueRow[]>`
        SELECT symbol, year_month, current_month_revenue, mom_change_percent, yoy_change_percent
        FROM "export"."monthly_revenue"
        WHERE year_month = ${yearMonth} AND source = 'MONTHLY_REVENUE'
      `
    : tpexExportPrisma.$queryRaw<RawMonthlyRevenueRow[]>`
        SELECT symbol, year_month, current_month_revenue, mom_change_percent, yoy_change_percent
        FROM "export"."monthly_revenue"
        WHERE year_month = ${yearMonth}
      `;

// ---- 融資融券餘額（export.margin_balance，兩邊欄位一致）----
export interface RawMarginBalanceRow {
  symbol: string;
  margin_today_balance: bigint | null;
  short_today_balance: bigint | null;
}

export const getLatestMarginBalanceTradeDate = async (market: Market): Promise<Date | null> => {
  const rows = await dbFor(market).$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."margin_balance" ORDER BY trade_date DESC LIMIT 1`;
  return rows[0]?.trade_date ?? null;
};

// 融資餘額是 0 或 null 時無法算券資比（分母不能是 0），直接在 SQL 排除。
export const listMarginBalanceForRatio = (market: Market, tradeDate: Date): Promise<RawMarginBalanceRow[]> =>
  dbFor(market).$queryRaw<RawMarginBalanceRow[]>`
    SELECT symbol, margin_today_balance, short_today_balance FROM "export"."margin_balance"
    WHERE trade_date = ${tradeDate} AND margin_today_balance > 0 AND short_today_balance IS NOT NULL
  `;

// ---- 每日收盤價（export.daily_price）跟最近兩個交易日 ----
// 交易日的取法兩邊不同：TWSE 查 daily_taiex_index（一天一筆、tradeDate 是 PK），不對 daily_price 查
// DISTINCT tradeDate——2026-09-02 實測 daily_price 150 萬筆只有 (symbol, tradeDate) 複合 PK，沒有單獨
// 對 tradeDate 的索引，那種查詢近乎全表掃描要 3~7 秒；TPEx 沒有大盤指數表，只能 DISTINCT。
export const getLatestTwoTradeDates = async (market: Market): Promise<[Date, Date] | null> => {
  const rows =
    market === 'TWSE'
      ? await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`
          SELECT trade_date FROM "export"."daily_taiex_index" ORDER BY trade_date DESC LIMIT 2
        `
      : await tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`
          SELECT DISTINCT trade_date FROM "export"."daily_price" ORDER BY trade_date DESC LIMIT 2
        `;
  if (rows.length < 2) return null;
  return [rows[0]!.trade_date, rows[1]!.trade_date];
};

export const listClosesForDate = (market: Market, tradeDate: Date): Promise<{ symbol: string; close: number | null }[]> =>
  dbFor(market).$queryRaw<{ symbol: string; close: number | null }[]>`SELECT symbol, close FROM "export"."daily_price" WHERE trade_date = ${tradeDate}`;

// ---- 注意股票（export.attention_history_note）----
// 只保留真正的上市/上櫃公司，比對子查詢直接寫進 SQL 的 WHERE（不是抓回來再用 JS 篩），避免 LIMIT
// 先切掉、篩選後剩不到 limit 筆。twseExportPrisma 是實體隔離的獨立 Neon 專案，不能跨 schema 查
// public.company_profile，所以 TWSE 由呼叫端先用 getSecuritySymbolSet 取得清單再 ANY(...) 帶進來；
// TPEx 的 export schema 本身有 company_profile 可以直接子查詢。
export interface RawAttentionHistoryNoteRow {
  symbol: string;
  trade_date: Date;
  criteria: string | null;
}

export const listAttentionNotesTwse = (eligibleSymbols: string[], limit: number): Promise<RawAttentionHistoryNoteRow[]> =>
  twseExportPrisma.$queryRaw<RawAttentionHistoryNoteRow[]>`
    SELECT symbol, trade_date, criteria
    FROM "export"."attention_history_note"
    WHERE symbol = ANY(${eligibleSymbols})
    ORDER BY trade_date DESC
    LIMIT ${limit}
  `;

export const listAttentionNotesTpex = (limit: number): Promise<RawAttentionHistoryNoteRow[]> =>
  tpexExportPrisma.$queryRaw<RawAttentionHistoryNoteRow[]>`
    SELECT symbol, trade_date, criteria
    FROM "export"."attention_history_note"
    WHERE symbol IN (SELECT symbol FROM "export"."company_profile")
    ORDER BY trade_date DESC
    LIMIT ${limit}
  `;

// ---- 處置股票（export.disposed_stock）----
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

export const listDisposedStocksTwse = (eligibleSymbols: string[], limit: number): Promise<RawTwseDisposedStockRow[]> =>
  twseExportPrisma.$queryRaw<RawTwseDisposedStockRow[]>`
    SELECT symbol, announce_date, announcement_count, reason, disposition_period, disposition_measures, detail, link_information
    FROM "export"."disposed_stock"
    WHERE symbol = ANY(${eligibleSymbols})
    ORDER BY announce_date DESC
    LIMIT ${limit}
  `;

export const listDisposedStocksTpex = (limit: number): Promise<RawTpexDisposedStockRow[]> =>
  tpexExportPrisma.$queryRaw<RawTpexDisposedStockRow[]>`
    SELECT symbol, announce_date, reason, disposition_period, detail
    FROM "export"."disposed_stock"
    WHERE symbol IN (SELECT symbol FROM "export"."company_profile")
    ORDER BY announce_date DESC
    LIMIT ${limit}
  `;

// application/ports/marketLists.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const exchangeMarketLists: MarketListsPort = {
  getLatestVolumeTop20TradeDate,
  listVolumeTop20Twse,
  listVolumeTop20Tpex,
  getLatestPriceLimitRangeTradeDate,
  listPriceLimitRangeTwse,
  listPriceLimitRangeTpex,
  getLatestMonthlyRevenueYearMonth,
  listMonthlyRevenueForMonth,
  getLatestMarginBalanceTradeDate,
  listMarginBalanceForRatio,
  getLatestTwoTradeDates,
  listClosesForDate,
  listAttentionNotesTwse,
  listAttentionNotesTpex,
  listDisposedStocksTwse,
  listDisposedStocksTpex,
};
