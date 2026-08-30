import twsePrisma from '@/adapters/prisma/twseClient';
import tpexPrisma from '@/adapters/prisma/tpexClient';
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

interface MarketQueryResult {
  rows: { symbol: string; value: number }[];
  excludedNonPositiveCount: number;
}

// 上市（TWSE）、上櫃（TPEx）各自查詢——兩邊 daily_valuation 欄位定義完全一樣（symbol/tradeDate/
// peRatio/pbRatio/dividendYield），2026-08-30 接上 TPEx 之前，這支端點雖然文件上寫「全市場」，
// 實際上只查了 TWSE，漏掉整個上櫃市場（bff-ts 實測 TWSE ~870-1080 檔、TPEx ~670-890 檔）。
// 各自先抓 limit 筆再合併重排，不是抓完全部再排序——兩邊個別的前 limit 名已經足夠湊出合併後
// 真正的前 limit 名（標準的「合併 k 個已排序列表取前 N 名」作法，見 calculateRanking 合併邏輯）。
const queryMarket = async (
  client: typeof twsePrisma | typeof tpexPrisma,
  tradeDate: Date,
  metric: RankingMetric,
  order: 'asc' | 'desc',
  limit: number,
  excludeNonPositive: boolean
): Promise<MarketQueryResult> => {
  const where = excludeNonPositive ? { tradeDate, [metric]: { gt: 0 } } : { tradeDate, [metric]: { not: null } };

  const [rows, excludedNonPositiveCount] = await Promise.all([
    client.dailyValuation.findMany({
      where,
      orderBy: { [metric]: order },
      take: limit,
      select: { symbol: true, peRatio: true, pbRatio: true, dividendYield: true },
    }),
    excludeNonPositive ? client.dailyValuation.count({ where: { tradeDate, [metric]: { lte: 0 } } }) : Promise.resolve(0),
  ]);

  return {
    rows: rows.map((row) => ({ symbol: row.symbol, value: Number(row[metric]) })),
    excludedNonPositiveCount,
  };
};

const getLatestValuationDate = async (): Promise<Date | null> => {
  const [twseLatest, tpexLatest] = await Promise.all([
    twsePrisma.dailyValuation.findFirst({ orderBy: { tradeDate: 'desc' }, select: { tradeDate: true } }),
    tpexPrisma.dailyValuation.findFirst({ orderBy: { tradeDate: 'desc' }, select: { tradeDate: true } }),
  ]);
  const dates = [twseLatest?.tradeDate, tpexLatest?.tradeDate].filter((d): d is Date => d !== undefined);
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (d > latest ? d : latest));
};

export const calculateRanking = async (query: RankingQuery): Promise<RankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [
    'peRatio/pbRatio/dividendYield 直接來自 oingg-twse（上市）/oingg-tpex（上櫃）的 daily_valuation，本服務沒有自己重算，見 valuation/marketRatios/ 的說明。',
  ];

  const tradeDate = query.date ? new Date(`${query.date}T00:00:00.000Z`) : await getLatestValuationDate();
  if (!tradeDate) {
    warnings.push('查無任何一天的 daily_valuation 資料，無法計算排行。');
    return { metric, order, limit, tradeDate: null, excludedNonPositiveCount: 0, rankings: [], warnings };
  }

  const excludeNonPositive = EXCLUDE_NON_POSITIVE[metric];
  const [twseResult, tpexResult] = await Promise.all([
    queryMarket(twsePrisma, tradeDate, metric, order, limit, excludeNonPositive),
    queryMarket(tpexPrisma, tradeDate, metric, order, limit, excludeNonPositive),
  ]);

  const merged = [...twseResult.rows, ...tpexResult.rows].sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));
  const limited = merged.slice(0, limit);

  if (limited.length === 0) {
    warnings.push(`${tradeDate.toISOString().slice(0, 10)} 查無符合條件的資料，無法計算排行。`);
  }

  const rankings: RankingRow[] = limited.map((row, index) => ({ rank: index + 1, symbol: row.symbol, value: row.value }));

  return {
    metric,
    order,
    limit,
    tradeDate: tradeDate.toISOString().slice(0, 10),
    excludedNonPositiveCount: twseResult.excludedNonPositiveCount + tpexResult.excludedNonPositiveCount,
    rankings,
    warnings,
  };
};
