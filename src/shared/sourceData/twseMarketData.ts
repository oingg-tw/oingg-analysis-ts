import twsePrisma from '@/adapters/prisma/twseClient';
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

const toNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// 指定 asOfDate 時，找「該日期或之前」最新的一筆交易日資料（指定日期不一定是交易日，例如週末）；
// 不指定就直接抓整張表最新一筆——用來回答「這家公司最新的 PER/PBR 是多少」。
// 一家公司只會在 TWSE 或 TPEx 其中一邊掛牌，所以先查 TWSE、查無資料再查 TPEx 就夠，不用兩邊都查再合併。
//
// TPEx 這邊 2026-09-01 改走 export.daily_valuation（tpexExportPrisma，$queryRaw——這張 view
// 沒有唯一識別欄位，Prisma Client 不會產生 model 存取子），取代原本 prisma/tpex/schema.prisma
// 讀 public schema 的舊帳號（那組帳號連的是 tpex-ts 的 dev 環境，資料比 export/prod 舊很多，
// 見 docs/bounded-contexts.md 或對話紀錄）。
export const getDailyValuationAsOf = async (symbol: string, asOfDate?: Date): Promise<DailyValuationAsOf | null> => {
  const twseRecord = await twsePrisma.dailyValuation.findFirst({
    where: asOfDate ? { symbol, tradeDate: { lte: asOfDate } } : { symbol },
    orderBy: { tradeDate: 'desc' },
  });
  if (twseRecord) {
    return {
      tradeDate: twseRecord.tradeDate,
      peRatio: toNullableNumber(twseRecord.peRatio),
      pbRatio: toNullableNumber(twseRecord.pbRatio),
      dividendYield: toNullableNumber(twseRecord.dividendYield),
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
// TPEx 這邊同上改走 export.daily_price（2026-09-01，取代讀 tpex-ts dev 環境的舊帳號）。
export const getLatestDailyPrice = async (symbol: string): Promise<DailyPriceAsOf | null> => {
  const twseRecord = await twsePrisma.dailyPrice.findFirst({ where: { symbol }, orderBy: { tradeDate: 'desc' } });
  if (twseRecord) return { tradeDate: twseRecord.tradeDate, close: toNullableNumber(twseRecord.close) };

  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexDailyPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_price" WHERE symbol = ${symbol} ORDER BY trade_date DESC LIMIT 1
  `;
  const tpexRecord = tpexRows[0];
  if (!tpexRecord) return null;
  return { tradeDate: tpexRecord.trade_date, close: toNullableNumber(tpexRecord.close) };
};

// 一次查多家公司的最新股價（GET /stocks/prices?symbols=... 用）——不知道每個 symbol 掛在哪個
// 市場，所以兩邊都查，各自取每家公司最新一筆，不逐一查詢避免 N+1。TWSE 用 Prisma 的
// distinct + orderBy（Postgres 底層是 DISTINCT ON）；TPEx 這邊改走 export.daily_price 沒有
// model 存取子，直接用 SQL 的 DISTINCT ON 達到同樣效果。
export const getLatestDailyPricesBatch = async (symbols: string[]): Promise<Map<string, DailyPriceAsOf>> => {
  if (symbols.length === 0) return new Map();

  const twseRows = await twsePrisma.dailyPrice.findMany({
    where: { symbol: { in: symbols } },
    distinct: ['symbol'],
    orderBy: [{ symbol: 'asc' }, { tradeDate: 'desc' }],
    select: { symbol: true, tradeDate: true, close: true },
  });

  interface RawTpexDailyPriceBatchRow extends RawTpexDailyPriceRow {
    symbol: string;
  }
  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexDailyPriceBatchRow[]>`
    SELECT DISTINCT ON (symbol) symbol, trade_date, close FROM "export"."daily_price"
    WHERE symbol = ANY(${symbols})
    ORDER BY symbol, trade_date DESC
  `;

  const result = new Map<string, DailyPriceAsOf>();
  for (const row of twseRows) {
    result.set(row.symbol, { tradeDate: row.tradeDate, close: toNullableNumber(row.close) });
  }
  for (const row of tpexRows) {
    result.set(row.symbol, { tradeDate: row.trade_date, close: toNullableNumber(row.close) });
  }
  return result;
};
