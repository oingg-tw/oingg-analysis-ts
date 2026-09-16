import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

export type OperatingIncomeGrowthRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type OperatingIncomeGrowthRateComputationBatch = ComputationBatch<'q'>;

// 營業利益成長率（單季年增率）= (本季營業利益 - 去年同季營業利益) / |去年同季營業利益| * 100。
// 只有 Q 一種 basis，跟 revenueGrowthRate/netIncomeGrowthRate 同一組設計。
export const computeOperatingIncomeGrowthRate = async (query: QuarterlyMetricQuery, deps: OperatingIncomeGrowthRateDeps): Promise<OperatingIncomeGrowthRateComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const currentOperatingIncome = incomeStatement?.operatingIncome ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await deps.statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorOperatingIncome = priorIncomeStatement?.operatingIncome ?? null;

  const { value: growthRate, nullReason } = calculateYoyGrowthRateBigint(currentOperatingIncome, priorOperatingIncome);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'operatingIncomeGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
