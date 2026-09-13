import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

export type AssetGrowthPitOutcome = StandardBasisPitOutcome;

// 總資產成長率（單季年增率）= (本季總資產 - 去年同季總資產) / |去年同季總資產| * 100。
// 跟 equityGrowthRate/shareCountChangeRate 同一組設計（getPastNQuarters({rocYear,season},5)[0]
// 取去年同季）。只有 Q 一種 basis——資產負債表時點快照，沒有 TTM 概念。
export const computeAndWriteAssetGrowthPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<AssetGrowthPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;
  const currentAssets = balanceSheet?.totalAssets ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await statements.getBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorAssets = priorBalanceSheet?.totalAssets ?? null;

  const growthRate =
    currentAssets !== null && priorAssets !== null && priorAssets !== 0n
      ? Math.round((Number(currentAssets - priorAssets) / Math.abs(Number(priorAssets))) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null = growthRate !== null ? null : currentAssets === null || priorAssets === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'assetGrowth', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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
