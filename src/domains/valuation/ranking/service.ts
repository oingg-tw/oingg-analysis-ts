import twsePrisma from '@/adapters/prisma/twseClient';
import type { RankingMetric, RankingQuery, RankingResult, RankingRow } from './types';

// peRatio/pbRatio <= 0 代表虧損（EPS 為負）或淨值為負，不是「便宜」，是財務體質出問題，
// 排行榜的目的是篩「便宜但體質正常」的公司，混進負值會讓「最低本益比」排行榜出現一堆
// 財務出問題的公司，不是使用者要的東西——這個排除只套用在 peRatio/pbRatio，dividendYield
// 本身沒有負值的情況（沒配息是 0，不是負的），不需要排除。
const EXCLUDE_NON_POSITIVE: Record<RankingMetric, boolean> = {
  peRatio: true,
  pbRatio: true,
  dividendYield: false,
};

const getLatestValuationDate = async (): Promise<Date | null> => {
  const row = await twsePrisma.dailyValuation.findFirst({ orderBy: { tradeDate: 'desc' }, select: { tradeDate: true } });
  return row?.tradeDate ?? null;
};

export const calculateRanking = async (query: RankingQuery): Promise<RankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [
    'peRatio/pbRatio/dividendYield 直接來自 oingg-twse 的 daily_valuation，本服務沒有自己重算，見 valuation/marketRatios/ 的說明。',
  ];

  const tradeDate = query.date ? new Date(`${query.date}T00:00:00.000Z`) : await getLatestValuationDate();
  if (!tradeDate) {
    warnings.push('查無任何一天的 daily_valuation 資料，無法計算排行。');
    return { metric, order, limit, tradeDate: null, excludedNonPositiveCount: 0, rankings: [], warnings };
  }

  const excludeNonPositive = EXCLUDE_NON_POSITIVE[metric];
  const where = excludeNonPositive ? { tradeDate, [metric]: { gt: 0 } } : { tradeDate, [metric]: { not: null } };

  const [rows, excludedNonPositiveCount] = await Promise.all([
    twsePrisma.dailyValuation.findMany({
      where,
      orderBy: { [metric]: order },
      take: limit,
      select: { symbol: true, peRatio: true, pbRatio: true, dividendYield: true },
    }),
    excludeNonPositive
      ? twsePrisma.dailyValuation.count({ where: { tradeDate, [metric]: { lte: 0 } } })
      : Promise.resolve(0),
  ]);

  if (rows.length === 0) {
    warnings.push(`${tradeDate.toISOString().slice(0, 10)} 查無符合條件的資料，無法計算排行。`);
  }

  const rankings: RankingRow[] = rows.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    value: Number(row[metric]),
  }));

  return {
    metric,
    order,
    limit,
    tradeDate: tradeDate.toISOString().slice(0, 10),
    excludedNonPositiveCount,
    rankings,
    warnings,
  };
};
