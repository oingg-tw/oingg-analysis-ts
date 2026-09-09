import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};

// 三張季度財報表金額單位是「千元」，流通股數是實際股數，分子要先 x1000 換算成元（跟 bvps.ts 一致）。
const toBvps = (equityInThousands: bigint | null, shares: bigint | null): number | null => {
  if (equityInThousands === null || shares === null || shares === 0n) return null;
  return Math.round(((Number(equityInThousands) * 1000) / Number(shares)) * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface BvpsGrowthRatePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

// BVPS 成長率（單季年增率）= (本季 BVPS - 去年同季 BVPS) / |去年同季 BVPS| * 100——獨立
// 重新計算本季/去年同季各自的 BVPS（不依賴 bvps 這個 metric_code 已寫入的值，跟
// epsGrowthRate 對 eps 的既有做法一致），流通股數各自用當下報告日對應的股本。跟
// equityGrowthRate（淨值總額成長率）搭配使用：淨值成長率 ≈ BVPS成長率 + 股本變化率——
// 兩者相等代表股本沒變動；BVPS成長率明顯低於淨值成長率，代表現金增資稀釋了每股淨值；
// 反之代表減資/買回墊高了每股淨值。跟 dividend 分類的 shareCountChangeRate 三支一起
// 組成第二張「淨值成長分解卡」，跟 growth 分類既有的 netIncomeGrowthRate/epsGrowthRate
// 那組（損益表視角）並列成資產負債表視角的版本。只有 Q 一種 basis——資產負債表時點快照，
// 沒有 TTM 概念（跟 bvps 自己一樣）。
export const computeAndWriteBvpsGrowthRatePit = async (query: QuarterlyMetricQuery): Promise<BvpsGrowthRatePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;
  const currentShares = reportDate ? (await getPaidInSharesAsOf(symbol, reportDate))?.paidInShares ?? null : null;
  const currentBvps = toBvps(pickEquity(balanceSheet).value, currentShares);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await getQuarterlyBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorReportDate = priorBalanceSheet?.reportDate ?? null;
  const priorShares = priorReportDate ? (await getPaidInSharesAsOf(symbol, priorReportDate))?.paidInShares ?? null : null;
  const priorBvps = toBvps(pickEquity(priorBalanceSheet).value, priorShares);

  const growthRate =
    currentBvps !== null && priorBvps !== null && priorBvps !== 0
      ? Math.round(((currentBvps - priorBvps) / Math.abs(priorBvps)) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null = growthRate !== null ? null : currentBvps === null || priorBvps === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'bvpsGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q'),
      value: growthRate,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
