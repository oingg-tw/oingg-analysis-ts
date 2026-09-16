import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——股東權益比率，
// 純資產負債表時點快照，單季即可，不需要歷史深度。只有 Q 一種 basis。


export type EquityRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type EquityRatioComputationBatch = ComputationBatch<'q'>;

export const computeEquityRatio = async (query: QuarterlyMetricQuery, deps: EquityRatioDeps): Promise<EquityRatioComputationBatch> => {
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

  const totalEquity = balanceSheet?.totalEquity ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;

  const ratio = totalEquity !== null && totalAssets !== null ? toPercent(totalEquity, totalAssets) : null;
  const nullReason: MetricNullReason | null = ratio !== null ? null : totalEquity === null || totalAssets === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'equityRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', ratio, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
