import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/shared/rocQuarter';

// 托賓Q值（Tobin's Q）= (市值 + 總負債) / 總資產（Tobin, 1969 的簡化版，市場對負債的評價
// 假設等於帳面值——跟 Wikipedia「Tobin's q = (Equity Market Value + Liabilities Book
// Value) / (Equity Book Value + Liabilities Book Value)」同一個公式，因為
// EquityBookValue + Liabilities = Assets，簡化成 (MarketCap + Liabilities) / Assets）。
// 市值查詢複用 getMarketCapAsOf，跟 marketCap/altmanZScore(X4) 同一套模式；資產負債表
// 欄位是千元，換算成實際金額後才跟市值（元）相加，同 altmanZScore X4 的處理方式。只有
// Q 一種 basis——資產負債表時點快照，沒有 TTM/年化概念，跟 ncav/bvps 同一種性質。

const toRatio4 = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface TobinsQPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

export const computeAndWriteTobinsQPit = async (query: QuarterlyMetricQuery): Promise<TobinsQPitOutcome> => {
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
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCapAsOf = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const marketCap = marketCapAsOf?.marketCap ?? null;

  const tobinsQ =
    marketCap !== null && totalLiabilities !== null && totalAssets !== null
      ? toRatio4(marketCap + Number(totalLiabilities) * 1000, Number(totalAssets) * 1000)
      : null;

  let nullReason: MetricNullReason | null = null;
  if (tobinsQ === null) {
    if (marketCap === null || totalLiabilities === null || totalAssets === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'tobinsQ',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: tobinsQ,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
