import twsePrisma from '@/adapters/prisma/twseClient';

export interface DailyValuationAsOf {
  tradeDate: Date;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
}

// 指定 asOfDate 時，找「該日期或之前」最新的一筆交易日資料（指定日期不一定是交易日，例如週末）；
// 不指定就直接抓整張表最新一筆——用來回答「這家公司最新的 PER/PBR 是多少」。
export const getDailyValuationAsOf = async (symbol: string, asOfDate?: Date): Promise<DailyValuationAsOf | null> => {
  const record = await twsePrisma.dailyValuation.findFirst({
    where: asOfDate ? { symbol, tradeDate: { lte: asOfDate } } : { symbol },
    orderBy: { tradeDate: 'desc' },
  });

  if (!record) return null;
  return {
    tradeDate: record.tradeDate,
    peRatio: record.peRatio !== null ? Number(record.peRatio) : null,
    pbRatio: record.pbRatio !== null ? Number(record.pbRatio) : null,
    dividendYield: record.dividendYield !== null ? Number(record.dividendYield) : null,
  };
};
