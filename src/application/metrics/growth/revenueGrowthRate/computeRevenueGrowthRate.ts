import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

export type RevenueGrowthRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type RevenueGrowthRateComputationBatch = ComputationBatch<'q'>;

// 營收成長率（單季年增率）= (本季營收 - 去年同季營收) / |去年同季營收| * 100。去年同季用
// getPastNQuarters({rocYear,season},5)[0] 取得，跟 shareCountChangeRate/piotroskiFScore
// 既有慣例一致。只有 Q 一種 basis——單季 vs 去年同季本來就是最常見的營收成長率呈現方式，
// 不疊加 TTM（TTM vs 去年 TTM 是另一種平滑季節性的版本，這裡先不做，需要的話是獨立擴充）。
export const computeRevenueGrowthRate = async (query: QuarterlyMetricQuery, deps: RevenueGrowthRateDeps): Promise<RevenueGrowthRateComputationBatch> => {
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
  const currentRevenue = incomeStatement?.operatingRevenue ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await deps.statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorRevenue = priorIncomeStatement?.operatingRevenue ?? null;

  const { value: growthRate, nullReason } = calculateYoyGrowthRateBigint(currentRevenue, priorRevenue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'revenueGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
