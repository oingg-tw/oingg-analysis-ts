import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

export interface ChangeLookupKey {
  symbol: string;
  market: 'TWSE' | 'TPEx';
  asOfDate: Date; // 以這一天（或更早的最近一個交易日）當基準日，往前數 tradingDaysBack 個交易日
}

const buildKey = (market: 'TWSE' | 'TPEx', symbol: string, asOfDate: Date): string => `${market}:${symbol}:${asOfDate.toISOString().slice(0, 10)}`;

// 上市/上櫃分開查——交易所警示股票的「近N日累積漲跌幅」是點對點比較，不是逐日漲跌幅加總：
// 累積漲跌幅 = (基準日收盤 - 往前數N個交易日收盤) / 往前數N個交易日收盤 x 100%
// 這個公式已經隱含複利效應（連續上漲時，累積漲幅會比逐日simple加總更高），不需要另外處理。
// 2026-09-02 應使用者要求新增，給 attention-stocks/disposed-stocks 補「這檔為什麼被列為
// 注意/處置」的價格脈絡用——TWSE 官方注意股票標準本來就包含「近6日累積漲跌幅逾25%~32%」
// 這類門檻，見 src/domains/market/attentionStocks/、disposedStocks/ 的說明。
//
// 同一個 (market, asOfDate) 分組查一次「往前數 tradingDaysBack+1 個交易日」的日期清單，
// 只需要清單裡最新跟最舊兩個日期的收盤價（點對點），不需要中間那幾天的資料。日期不足
// tradingDaysBack+1 個（例如剛上市沒多久的公司）時，該分組全部回傳 null，不是拋錯。
export const getCumulativeChangePercent = async (keys: ChangeLookupKey[], tradingDaysBack: number): Promise<Map<string, number | null>> => {
  const result = new Map<string, number | null>();
  if (keys.length === 0) return result;

  const groups = new Map<string, { market: 'TWSE' | 'TPEx'; asOfDate: Date; symbols: Set<string> }>();
  for (const key of keys) {
    const groupKey = `${key.market}:${key.asOfDate.toISOString().slice(0, 10)}`;
    const group = groups.get(groupKey);
    if (group) {
      group.symbols.add(key.symbol);
    } else {
      groups.set(groupKey, { market: key.market, asOfDate: key.asOfDate, symbols: new Set([key.symbol]) });
    }
  }

  for (const group of groups.values()) {
    const symbols = [...group.symbols];
    const dates =
      group.market === 'TWSE'
        ? (
            await twsePrisma.dailyPrice.findMany({
              distinct: ['tradeDate'],
              where: { tradeDate: { lte: group.asOfDate } },
              orderBy: { tradeDate: 'desc' },
              take: tradingDaysBack + 1,
              select: { tradeDate: true },
            })
          ).map((row) => row.tradeDate)
        : (
            await tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`
              SELECT DISTINCT trade_date FROM "export"."daily_price" WHERE trade_date <= ${group.asOfDate} ORDER BY trade_date DESC LIMIT ${tradingDaysBack + 1}
            `
          ).map((row) => row.trade_date);

    if (dates.length < tradingDaysBack + 1) {
      for (const symbol of symbols) result.set(buildKey(group.market, symbol, group.asOfDate), null);
      continue;
    }

    const latestDate = dates[0]!;
    const baseDate = dates[tradingDaysBack]!;

    const closesByDate =
      group.market === 'TWSE'
        ? await twsePrisma.dailyPrice
            .findMany({
              where: { tradeDate: { in: [latestDate, baseDate] }, symbol: { in: symbols } },
              select: { symbol: true, tradeDate: true, close: true },
            })
            .then((rows) => rows.map((row) => ({ symbol: row.symbol, tradeDate: row.tradeDate, close: row.close === null ? null : Number(row.close) })))
        : (
            await tpexExportPrisma.$queryRaw<{ symbol: string; trade_date: Date; close: number | null }[]>`
              SELECT symbol, trade_date, close FROM "export"."daily_price" WHERE trade_date IN (${latestDate}, ${baseDate}) AND symbol = ANY(${symbols})
            `
          ).map((row) => ({ symbol: row.symbol, tradeDate: row.trade_date, close: row.close === null ? null : Number(row.close) }));

    const latestBySymbol = new Map<string, number>();
    const baseBySymbol = new Map<string, number>();
    for (const row of closesByDate) {
      if (row.close === null) continue;
      if (row.tradeDate.getTime() === latestDate.getTime()) latestBySymbol.set(row.symbol, row.close);
      if (row.tradeDate.getTime() === baseDate.getTime()) baseBySymbol.set(row.symbol, row.close);
    }

    for (const symbol of symbols) {
      const latestClose = latestBySymbol.get(symbol);
      const baseClose = baseBySymbol.get(symbol);
      const value = latestClose === undefined || baseClose === undefined || baseClose <= 0 ? null : Math.round(((latestClose - baseClose) / baseClose) * 100 * 100) / 100;
      result.set(buildKey(group.market, symbol, group.asOfDate), value);
    }
  }

  return result;
};

export const cumulativeChangePercentKey = buildKey;
