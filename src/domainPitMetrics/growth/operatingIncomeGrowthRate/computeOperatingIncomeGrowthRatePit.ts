import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface OperatingIncomeGrowthRatePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

// 營業利益成長率（單季年增率）= (本季營業利益 - 去年同季營業利益) / |去年同季營業利益| * 100。
// 只有 Q 一種 basis，跟 revenueGrowthRate/netIncomeGrowthRate 同一組設計。
export const computeAndWriteOperatingIncomeGrowthRatePit = async (query: QuarterlyMetricQuery): Promise<OperatingIncomeGrowthRatePitOutcome> => {
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
  const currentOperatingIncome = incomeStatement?.operatingIncome ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await getQuarterlyIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorOperatingIncome = priorIncomeStatement?.operatingIncome ?? null;

  const growthRate =
    currentOperatingIncome !== null && priorOperatingIncome !== null && priorOperatingIncome !== 0n
      ? Math.round((Number(currentOperatingIncome - priorOperatingIncome) / Math.abs(Number(priorOperatingIncome))) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null =
    growthRate !== null ? null : currentOperatingIncome === null || priorOperatingIncome === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'operatingIncomeGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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
