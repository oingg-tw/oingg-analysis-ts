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

  // 每個 (market, asOfDate) 分組平行處理，不是逐一 await——disposed-stocks 這種清單型端點常常
  // 同時有好幾個不同的 announce_date（每檔股票公告日期不一樣），逐一處理會讓好幾組「查日期+
  // 查收盤價」的網路往返疊加起來，2026-09-02 實測發現這是修完 daily_taiex_index 索引問題後
  // disposed-stocks 依然要 6 秒的主因（改平行後才會真的吃到「每組各自獨立、互不阻塞」的效果）。
  await Promise.all(
    [...groups.values()].map(async (group) => {
    const symbols = [...group.symbols];
    // TWSE 這邊改查 daily_taiex_index（大盤指數，一天一筆、tradeDate 本身就是 PK）取交易日
    // 曆，不直接對 daily_price 查 DISTINCT tradeDate——2026-09-02 實測發現 daily_price 150萬筆
    // 只有 (symbol, tradeDate) 複合 PK，沒有單獨對 tradeDate 的索引，「取全市場最新幾個交易日」
    // 這種不帶 symbol 條件的查詢會是近乎全表掃描，單次 3~7 秒，是 disposed-stocks/
    // attention-stocks/price-change-ranking 回應緩慢（4~12秒）的根因。台股所有個股都跟大盤
    // 同一套開休市日曆，daily_taiex_index 只有 6852 筆、當交易日曆用又快又準；實際收盤價還是
    // 從 daily_price 查（那個查詢有 symbol 條件，走得到 PK 索引，本來就快）。
    const dates =
      group.market === 'TWSE'
        ? (
            await twsePrisma.dailyTaiexIndex.findMany({
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
      return;
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
    })
  );

  return result;
};

export const cumulativeChangePercentKey = buildKey;
