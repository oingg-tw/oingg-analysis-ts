import twsePrisma from '@/adapters/prisma/twseClient';
import type { ForeignHoldingChangeRow, ForeignHoldingRankingQuery, ForeignHoldingRankingResult } from './types';

// 找最新的兩個「有資料」的交易日——不能假設連續兩個日曆日，週末/國定假日中間會跳過。
const getLatestTwoTradeDates = async (): Promise<[Date, Date] | null> => {
  const rows = await twsePrisma.foreignHolding.findMany({
    distinct: ['tradeDate'],
    orderBy: { tradeDate: 'desc' },
    take: 2,
    select: { tradeDate: true },
  });
  if (rows.length < 2) return null;
  return [rows[0]!.tradeDate, rows[1]!.tradeDate];
};

// 外資持股「加碼/減碼排行」——2026-09-01 應使用者要求新增。比較最近兩個交易日的
// shares_held_percent（外資持股佔已發行股數比例），用百分點變動排序，不是張數變動幅度
// （張數會被增減資干擾，比例才是市場慣用的「外資加碼/減碼」定義，見 schema 註解）。
// topPercent 是「排序後取前幾 %」，不是固定筆數——母數是「兩個交易日都有資料、可以比較」的
// 公司數，不是全市場公司數（有些公司可能剛好某天缺資料）。
export const calculateForeignHoldingRanking = async (query: ForeignHoldingRankingQuery): Promise<ForeignHoldingRankingResult> => {
  const { topPercent } = query;
  const warnings: string[] = [];

  const dates = await getLatestTwoTradeDates();
  if (!dates) {
    warnings.push('foreign_holding 資料不足兩個交易日，無法比較變動。');
    return { tradeDate: '', previousTradeDate: '', topPercent, eligibleCompanyCount: 0, increases: [], decreases: [], warnings };
  }
  const [tradeDate, previousTradeDate] = dates;

  const [todayRows, previousRows] = await Promise.all([
    twsePrisma.foreignHolding.findMany({ where: { tradeDate }, select: { symbol: true, sharesHeld: true, sharesHeldPercent: true } }),
    twsePrisma.foreignHolding.findMany({ where: { tradeDate: previousTradeDate }, select: { symbol: true, sharesHeldPercent: true } }),
  ]);

  const previousBySymbol = new Map(previousRows.map((row) => [row.symbol, Number(row.sharesHeldPercent)]));

  const changes: ForeignHoldingChangeRow[] = [];
  for (const row of todayRows) {
    const previousPercent = previousBySymbol.get(row.symbol);
    if (previousPercent === undefined) continue; // 前一個交易日沒有這家公司的資料，無法比較，跳過。
    const todayPercent = Number(row.sharesHeldPercent);
    changes.push({
      symbol: row.symbol,
      sharesHeldPercent: todayPercent,
      previousSharesHeldPercent: previousPercent,
      changePercentagePoints: Math.round((todayPercent - previousPercent) * 100) / 100,
      sharesHeld: row.sharesHeld.toString(),
    });
  }

  if (changes.length === 0) {
    warnings.push(`${tradeDate.toISOString().slice(0, 10)} 跟 ${previousTradeDate.toISOString().slice(0, 10)} 沒有任何一家公司兩天都有資料，無法比較。`);
  }

  const take = Math.max(1, Math.ceil((changes.length * topPercent) / 100));
  const increases = [...changes].sort((a, b) => b.changePercentagePoints - a.changePercentagePoints).slice(0, take);
  const decreases = [...changes].sort((a, b) => a.changePercentagePoints - b.changePercentagePoints).slice(0, take);

  return {
    tradeDate: tradeDate.toISOString().slice(0, 10),
    previousTradeDate: previousTradeDate.toISOString().slice(0, 10),
    topPercent,
    eligibleCompanyCount: changes.length,
    increases,
    decreases,
    warnings,
  };
};
