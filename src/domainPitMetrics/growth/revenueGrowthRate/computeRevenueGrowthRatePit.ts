import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface RevenueGrowthRatePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

// 營收成長率（單季年增率）= (本季營收 - 去年同季營收) / |去年同季營收| * 100。去年同季用
// getPastNQuarters({rocYear,season},5)[0] 取得，跟 shareCountChangeRate/piotroskiFScore
// 既有慣例一致。只有 Q 一種 basis——單季 vs 去年同季本來就是最常見的營收成長率呈現方式，
// 不疊加 TTM（TTM vs 去年 TTM 是另一種平滑季節性的版本，這裡先不做，需要的話是獨立擴充）。
export const computeAndWriteRevenueGrowthRatePit = async (query: QuarterlyMetricQuery): Promise<RevenueGrowthRatePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await getQuarterlyIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const currentRevenue = incomeStatement?.operatingRevenue ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await getQuarterlyIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorRevenue = priorIncomeStatement?.operatingRevenue ?? null;

  const growthRate =
    currentRevenue !== null && priorRevenue !== null && priorRevenue !== 0n
      ? Math.round((Number(currentRevenue - priorRevenue) / Math.abs(Number(priorRevenue))) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null =
    growthRate !== null ? null : currentRevenue === null || priorRevenue === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'revenueGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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
