import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import type { DailyPriceAsOf, DailyValuationAsOf } from '@/application/ports/marketData';
import { twseDividendYield } from '@/domain/market/twseDividendYield';

// DailyValuationAsOf / DailyPriceAsOf 2026-09-17 Phase 3 搬到 application/ports/marketData.ts（port 的 DTO），這裡 re-export 給既有 import 路徑。
export type { DailyPriceAsOf, DailyValuationAsOf };

interface RawTwseDailyValuationRow {
  trade_date: Date;
  pe_ratio: unknown;
  pb_ratio: unknown;
  dividend_yield: unknown;
}

const toNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));


// 指定 asOfDate 時，找「該日期或之前」最新的一筆交易日資料（指定日期不一定是交易日，例如週末）；
// 不指定就直接抓整張表最新一筆——用來回答「這家公司最新的 PER/PBR 是多少」。
// 一家公司只會在 TWSE 或 TPEx 其中一邊掛牌，所以先查 TWSE、查無資料再查 TPEx 就夠，不用兩邊都查再合併。
//
// 2026-09-03 使用者決定 curated 中台層現階段太早，TWSE 這邊改回直接查 twseExportPrisma（跟
// TPEx 同一種模式——export schema 沒有唯一識別欄位，走 $queryRaw）。
// 2026-09-26 上市、上櫃兩邊都查、取交易日較新的那筆（轉板公司兩邊都有資料：8476 2023-10 上櫃轉上市，舊版「上市查得到就不查上櫃」
// 在反向轉板時會拿到舊值；批次版本更是用上櫃的舊價蓋掉上市的新價，bff-ts 量到 8476 股價停在 2023-10-30）。
const newerOf = <R extends { trade_date: Date }>(a: R | undefined, b: R | undefined): R | undefined =>
  !a ? b : !b ? a : a.trade_date >= b.trade_date ? a : b;

const queryDailyValuation = (db: typeof twseExportPrisma | typeof tpexExportPrisma, symbol: string, asOfDate?: Date) =>
  asOfDate
    ? db.$queryRaw<RawTwseDailyValuationRow[]>`
        SELECT trade_date, pe_ratio, pb_ratio, dividend_yield FROM "export"."daily_valuation"
        WHERE symbol = ${symbol} AND trade_date <= ${asOfDate}
        ORDER BY trade_date DESC LIMIT 1
      `
    : db.$queryRaw<RawTwseDailyValuationRow[]>`
        SELECT trade_date, pe_ratio, pb_ratio, dividend_yield FROM "export"."daily_valuation"
        WHERE symbol = ${symbol}
        ORDER BY trade_date DESC LIMIT 1
      `;

export const getDailyValuationAsOf = async (symbol: string, asOfDate?: Date): Promise<DailyValuationAsOf | null> => {
  const [twseRows, tpexRows] = await Promise.all([queryDailyValuation(twseExportPrisma, symbol, asOfDate), queryDailyValuation(tpexExportPrisma, symbol, asOfDate)]);
  const twse = twseRows[0] && { ...twseRows[0], dividend_yield: twseDividendYield(toNullableNumber(twseRows[0].dividend_yield), twseRows[0].trade_date) };
  const record = newerOf(twse, tpexRows[0]);
  if (!record) return null;
  return {
    tradeDate: record.trade_date,
    peRatio: toNullableNumber(record.pe_ratio),
    pbRatio: toNullableNumber(record.pb_ratio),
    dividendYield: toNullableNumber(record.dividend_yield),
  };
};

interface RawTpexDailyPriceRow {
  trade_date: Date;
  close: unknown;
}

// 單一公司查最新股價（GET /stocks/:symbol/quote 用）——兩邊都查、取較新（見 newerOf）。
// 2026-09-27 只取有成交的日子（close IS NOT NULL，跟 twse/marketCap.ts getStockPriceAsOf 2026-09-06 同一個修法）：
// 最新交易日沒成交的股票（2321 2026-09-24、冷門股、停止交易中）原本拿到 close null，所有即時指標整支跳過、個股報價顯示沒有股價；
// 改成最近一筆實際成交（tradeDate 是那筆成交的日期）。
export const getLatestDailyPrice = async (symbol: string): Promise<DailyPriceAsOf | null> => {
  const query = (db: typeof twseExportPrisma | typeof tpexExportPrisma) =>
    db.$queryRaw<RawTpexDailyPriceRow[]>`SELECT trade_date, close FROM "export"."daily_price" WHERE symbol = ${symbol} AND close IS NOT NULL ORDER BY trade_date DESC LIMIT 1`;
  const [twseRows, tpexRows] = await Promise.all([query(twseExportPrisma), query(tpexExportPrisma)]);
  const record = newerOf(twseRows[0], tpexRows[0]);
  return record ? { tradeDate: record.trade_date, close: toNullableNumber(record.close) } : null;
};

export interface DailyPriceHistoryEntry {
  tradeDate: string; // "YYYY-MM-DD"
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface RawDailyPriceHistoryRow {
  trade_date: Date;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
}

// 2026-09-10 web-nuxt 轉達使用者需求：個股頁面「市場評價」分頁要一張真正的逐日股價線圖
// （不是既有 PE/PB 河流圖裡用的季報型 stockPrice metricCode，那是每季一個點，不是逐日）。
// 一家公司只會在 TWSE 或 TPEx 其中一邊掛牌，先查 TWSE、查無資料再查 TPEx 就夠，跟
// getLatestDailyPrice 同一種判斷。依交易日新到舊排序、取最近 limit 筆——跟
// getForeignShareholdingHistory 同一種「limit=最近幾筆」慣例，不是日期區間參數，呼叫端
// 不用自己換算日期。
//
// 2026-09-16 應 web-nuxt 要求新增 earliestAvailableTradeDate——「大盤連動程度」比較圖
// 讓使用者切換近1/2/3/5/8年，前端原本只能拿 entries 陣列長度用「250 交易日/年」概估
// 這檔股票夠不夠長的歷史，近期 IPO 這類公司會被概估誤判。改成額外查一次這檔股票在
// daily_price 裡最早的交易日（不受 limit 影響，是這檔股票的全部歷史範圍，不是這次
// 查詢實際回傳的範圍），前端可以直接用「今天 − earliestAvailableTradeDate」算出精確
// 天數/年數，不用再概估。
export const getDailyPriceHistory = async (symbol: string, limit: number): Promise<{ entries: DailyPriceHistoryEntry[]; earliestAvailableTradeDate: string | null }> => {
  const toEntries = (rows: RawDailyPriceHistoryRow[]): DailyPriceHistoryEntry[] =>
    rows.map((row) => ({
      tradeDate: row.trade_date.toISOString().slice(0, 10),
      open: toNullableNumber(row.open),
      high: toNullableNumber(row.high),
      low: toNullableNumber(row.low),
      close: toNullableNumber(row.close),
      volume: toNullableNumber(row.volume),
    }));

  // 2026-09-26 兩邊合併（轉板公司轉板前的歷史在另一個市場；舊版只要上市有資料就不看上櫃，8476 轉上市前的走勢整段不見）。
  const query = (db: typeof twseExportPrisma | typeof tpexExportPrisma) =>
    db.$queryRaw<RawDailyPriceHistoryRow[]>`
      SELECT trade_date, open, high, low, close, volume FROM "export"."daily_price"
      WHERE symbol = ${symbol}
      ORDER BY trade_date DESC LIMIT ${limit}
    `;
  const earliest = (db: typeof twseExportPrisma | typeof tpexExportPrisma) =>
    db.$queryRaw<{ earliest: Date | null }[]>`SELECT MIN(trade_date) AS earliest FROM "export"."daily_price" WHERE symbol = ${symbol}`;
  const [twseRows, tpexRows, twseEarliest, tpexEarliest] = await Promise.all([query(twseExportPrisma), query(tpexExportPrisma), earliest(twseExportPrisma), earliest(tpexExportPrisma)]);
  const byDate = new Map<string, RawDailyPriceHistoryRow>();
  for (const row of [...tpexRows, ...twseRows]) byDate.set(row.trade_date.toISOString().slice(0, 10), row); // 同一天兩邊都有時以上市為準
  const rows = [...byDate.values()].sort((a, b) => b.trade_date.getTime() - a.trade_date.getTime()).slice(0, limit);
  const earliestDates = [twseEarliest[0]?.earliest, tpexEarliest[0]?.earliest].filter((d): d is Date => !!d);
  const earliestAvailableTradeDate = earliestDates.length > 0 ? new Date(Math.min(...earliestDates.map((d) => d.getTime()))).toISOString().slice(0, 10) : null;
  return { entries: toEntries(rows).reverse(), earliestAvailableTradeDate };
};

// 一次查多家公司的最新股價（GET /stocks/prices?symbols=... 用）——不知道每個 symbol 掛在哪個
// 市場，所以兩邊都查，各自取每家公司最新一筆，不逐一查詢避免 N+1。2026-09-03 起 TWSE/TPEx
// 都走 export schema、都沒有 model 存取子，統一用 SQL 的 DISTINCT ON 達到同樣效果。
export const getLatestDailyPricesBatch = async (symbols: string[]): Promise<Map<string, DailyPriceAsOf>> => {
  if (symbols.length === 0) return new Map();

  interface RawDailyPriceBatchRow extends RawTpexDailyPriceRow {
    symbol: string;
  }
  const twseRows = await twseExportPrisma.$queryRaw<RawDailyPriceBatchRow[]>`
    SELECT DISTINCT ON (symbol) symbol, trade_date, close FROM "export"."daily_price"
    WHERE symbol = ANY(${symbols})
    ORDER BY symbol, trade_date DESC
  `;
  const tpexRows = await tpexExportPrisma.$queryRaw<RawDailyPriceBatchRow[]>`
    SELECT DISTINCT ON (symbol) symbol, trade_date, close FROM "export"."daily_price"
    WHERE symbol = ANY(${symbols})
    ORDER BY symbol, trade_date DESC
  `;

  // 同一家兩邊都有（轉板）時取交易日較新的——舊版用上櫃蓋上市，8476／1752／6446 停在轉板前的舊價。
  const result = new Map<string, DailyPriceAsOf>();
  for (const row of [...twseRows, ...tpexRows]) {
    const existing = result.get(row.symbol);
    if (!existing || row.trade_date > existing.tradeDate) result.set(row.symbol, { tradeDate: row.trade_date, close: toNullableNumber(row.close) });
  }
  return result;
};
