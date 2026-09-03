import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

export interface DailyValuationAsOf {
  tradeDate: Date;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
}

interface RawTpexDailyValuationRow {
  trade_date: Date;
  pe_ratio: unknown;
  pb_ratio: unknown;
  dividend_yield: unknown;
}

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
export const getDailyValuationAsOf = async (symbol: string, asOfDate?: Date): Promise<DailyValuationAsOf | null> => {
  const twseRows = asOfDate
    ? await twseExportPrisma.$queryRaw<RawTwseDailyValuationRow[]>`
        SELECT trade_date, pe_ratio, pb_ratio, dividend_yield FROM "export"."daily_valuation"
        WHERE symbol = ${symbol} AND trade_date <= ${asOfDate}
        ORDER BY trade_date DESC LIMIT 1
      `
    : await twseExportPrisma.$queryRaw<RawTwseDailyValuationRow[]>`
        SELECT trade_date, pe_ratio, pb_ratio, dividend_yield FROM "export"."daily_valuation"
        WHERE symbol = ${symbol}
        ORDER BY trade_date DESC LIMIT 1
      `;
  const twseRecord = twseRows[0];
  if (twseRecord) {
    return {
      tradeDate: twseRecord.trade_date,
      peRatio: toNullableNumber(twseRecord.pe_ratio),
      pbRatio: toNullableNumber(twseRecord.pb_ratio),
      dividendYield: toNullableNumber(twseRecord.dividend_yield),
    };
  }

  const tpexRows = asOfDate
    ? await tpexExportPrisma.$queryRaw<RawTpexDailyValuationRow[]>`
        SELECT trade_date, pe_ratio, pb_ratio, dividend_yield FROM "export"."daily_valuation"
        WHERE symbol = ${symbol} AND trade_date <= ${asOfDate}
        ORDER BY trade_date DESC LIMIT 1
      `
    : await tpexExportPrisma.$queryRaw<RawTpexDailyValuationRow[]>`
        SELECT trade_date, pe_ratio, pb_ratio, dividend_yield FROM "export"."daily_valuation"
        WHERE symbol = ${symbol}
        ORDER BY trade_date DESC LIMIT 1
      `;
  const tpexRecord = tpexRows[0];
  if (!tpexRecord) return null;
  return {
    tradeDate: tpexRecord.trade_date,
    peRatio: toNullableNumber(tpexRecord.pe_ratio),
    pbRatio: toNullableNumber(tpexRecord.pb_ratio),
    dividendYield: toNullableNumber(tpexRecord.dividend_yield),
  };
};

export interface DailyPriceAsOf {
  tradeDate: Date;
  close: number | null;
}

interface RawTpexDailyPriceRow {
  trade_date: Date;
  close: unknown;
}

// 單一公司查最新股價（GET /stocks/:symbol/quote 用）——一樣先查 TWSE 再查 TPEx。
export const getLatestDailyPrice = async (symbol: string): Promise<DailyPriceAsOf | null> => {
  const twseRows = await twseExportPrisma.$queryRaw<RawTpexDailyPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_price" WHERE symbol = ${symbol} ORDER BY trade_date DESC LIMIT 1
  `;
  const twseRecord = twseRows[0];
  if (twseRecord) return { tradeDate: twseRecord.trade_date, close: toNullableNumber(twseRecord.close) };

  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexDailyPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_price" WHERE symbol = ${symbol} ORDER BY trade_date DESC LIMIT 1
  `;
  const tpexRecord = tpexRows[0];
  if (!tpexRecord) return null;
  return { tradeDate: tpexRecord.trade_date, close: toNullableNumber(tpexRecord.close) };
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

  const result = new Map<string, DailyPriceAsOf>();
  for (const row of twseRows) {
    result.set(row.symbol, { tradeDate: row.trade_date, close: toNullableNumber(row.close) });
  }
  for (const row of tpexRows) {
    result.set(row.symbol, { tradeDate: row.trade_date, close: toNullableNumber(row.close) });
  }
  return result;
};
