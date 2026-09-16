import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

export type NetIncomeGrowthRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type NetIncomeGrowthRateComputationBatch = ComputationBatch<'q'>;

// 淨利成長率（單季年增率）= (本季淨利 - 去年同季淨利) / |去年同季淨利| * 100。淨利優先採
// 歸屬母公司口徑，缺漏退回整體口徑（比照 pickNetIncome 既有規則）。只有 Q 一種 basis。
export const computeNetIncomeGrowthRate = async (query: QuarterlyMetricQuery, deps: NetIncomeGrowthRateDeps): Promise<NetIncomeGrowthRateComputationBatch> => {
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
  const currentNetIncome = pickNetIncome(incomeStatement).value;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await deps.statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorNetIncome = pickNetIncome(priorIncomeStatement).value;

  const { value: growthRate, nullReason } = calculateYoyGrowthRateBigint(currentNetIncome, priorNetIncome);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'netIncomeGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
