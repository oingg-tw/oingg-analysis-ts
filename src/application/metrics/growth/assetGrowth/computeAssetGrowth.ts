import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

export type AssetGrowthDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type AssetGrowthComputationBatch = ComputationBatch<'q'>;

// 總資產成長率（單季年增率）= (本季總資產 - 去年同季總資產) / |去年同季總資產| * 100。
// 跟 equityGrowthRate/shareCountChangeRate 同一組設計（getPastNQuarters({rocYear,season},5)[0]
// 取去年同季）。只有 Q 一種 basis——資產負債表時點快照，沒有 TTM 概念。
export const computeAssetGrowth = async (query: QuarterlyMetricQuery, deps: AssetGrowthDeps): Promise<AssetGrowthComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;
  const currentAssets = balanceSheet?.totalAssets ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await deps.statements.getBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorAssets = priorBalanceSheet?.totalAssets ?? null;

  const { value: growthRate, nullReason } = calculateYoyGrowthRateBigint(currentAssets, priorAssets);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'assetGrowth', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
