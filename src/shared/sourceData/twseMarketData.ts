import twsePrisma from '@/adapters/prisma/twseClient';
import tpexPrisma from '@/adapters/prisma/tpexClient';

export interface DailyValuationAsOf {
  tradeDate: Date;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
}

// 指定 asOfDate 時，找「該日期或之前」最新的一筆交易日資料（指定日期不一定是交易日，例如週末）；
// 不指定就直接抓整張表最新一筆——用來回答「這家公司最新的 PER/PBR 是多少」。
// 一家公司只會在 TWSE 或 TPEx 其中一邊掛牌，所以先查 TWSE、查無資料再查 TPEx 就夠，不用兩邊都查再合併。
export const getDailyValuationAsOf = async (symbol: string, asOfDate?: Date): Promise<DailyValuationAsOf | null> => {
  const where = asOfDate ? { symbol, tradeDate: { lte: asOfDate } } : { symbol };
  const orderBy = { tradeDate: 'desc' as const };

  const record =
    (await twsePrisma.dailyValuation.findFirst({ where, orderBy })) ??
    (await tpexPrisma.dailyValuation.findFirst({ where, orderBy }));

  if (!record) return null;
  return {
    tradeDate: record.tradeDate,
    peRatio: record.peRatio !== null ? Number(record.peRatio) : null,
    pbRatio: record.pbRatio !== null ? Number(record.pbRatio) : null,
    dividendYield: record.dividendYield !== null ? Number(record.dividendYield) : null,
  };
};

export interface DailyPriceAsOf {
  tradeDate: Date;
  close: number | null;
}

// 單一公司查最新股價（GET /stocks/:symbol/quote 用）——一樣先查 TWSE 再查 TPEx。
// 已知現況（2026-09-01）：oingg-tpex 的 daily_price 目前是空表（company_profile/daily_valuation
// 都有資料，只有 daily_price 是 0 筆），所以現在每一檔上櫃公司查出來的 close 一定是 null，
// 不是這裡的邏輯有問題——等 tpex-ts 回補 daily_price 之後會自動改善，不用改這支函式。
export const getLatestDailyPrice = async (symbol: string): Promise<DailyPriceAsOf | null> => {
  const orderBy = { tradeDate: 'desc' as const };
  const record =
    (await twsePrisma.dailyPrice.findFirst({ where: { symbol }, orderBy })) ??
    (await tpexPrisma.dailyPrice.findFirst({ where: { symbol }, orderBy }));

  if (!record) return null;
  return { tradeDate: record.tradeDate, close: record.close !== null ? Number(record.close) : null };
};

// 一次查多家公司的最新股價（GET /stocks/prices?symbols=... 用）——不知道每個 symbol 掛在哪個
// 市場，所以兩邊都查，用 Prisma 的 distinct + orderBy 各自取每家公司最新一筆（Postgres 底層是
// DISTINCT ON，orderBy 開頭要跟 distinct 的欄位一致才會準確），不逐一查詢避免 N+1。
export const getLatestDailyPricesBatch = async (symbols: string[]): Promise<Map<string, DailyPriceAsOf>> => {
  if (symbols.length === 0) return new Map();

  const distinctLatestPerSymbol = { symbol: { in: symbols } } as const;
  const orderBy = [{ symbol: 'asc' as const }, { tradeDate: 'desc' as const }];

  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.dailyPrice.findMany({ where: distinctLatestPerSymbol, distinct: ['symbol'], orderBy, select: { symbol: true, tradeDate: true, close: true } }),
    tpexPrisma.dailyPrice.findMany({ where: distinctLatestPerSymbol, distinct: ['symbol'], orderBy, select: { symbol: true, tradeDate: true, close: true } }),
  ]);

  const result = new Map<string, DailyPriceAsOf>();
  for (const row of [...twseRows, ...tpexRows]) {
    result.set(row.symbol, { tradeDate: row.tradeDate, close: row.close !== null ? Number(row.close) : null });
  }
  return result;
};
