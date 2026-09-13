import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type IncomeStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface NetIncomeGrowthRatePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

// 淨利成長率（單季年增率）= (本季淨利 - 去年同季淨利) / |去年同季淨利| * 100。淨利優先採
// 歸屬母公司口徑，缺漏退回整體口徑（比照 pickNetIncome 既有規則）。只有 Q 一種 basis。
export const computeAndWriteNetIncomeGrowthRatePit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort = financialDataAdapter): Promise<NetIncomeGrowthRatePitOutcome> => {
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
  const incomeStatement = await statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const currentNetIncome = pickNetIncome(incomeStatement).value;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorNetIncome = pickNetIncome(priorIncomeStatement).value;

  const growthRate =
    currentNetIncome !== null && priorNetIncome !== null && priorNetIncome !== 0n
      ? Math.round((Number(currentNetIncome - priorNetIncome) / Math.abs(Number(priorNetIncome))) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null =
    growthRate !== null ? null : currentNetIncome === null || priorNetIncome === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'netIncomeGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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
