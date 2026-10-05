import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { annualReportSlot, resolveAnnualReportContext } from '@/application/metrics/shared/annualReportSlot';

export type EquityGrowthRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'annualReports' | 'shares'>;

export type EquityGrowthRateComputationBatch = ComputationBatch<'q' | 'fy'>;

// 淨值成長率（單季年增率）= (本季期末淨值 - 去年同季期末淨值) / |去年同季期末淨值| * 100。
// 淨值優先採歸屬母公司口徑，缺漏退回整體口徑（比照既有 pickEquity 規則，見 computeRoePit.ts）。
// 只有 Q 一種 basis——資產負債表時點快照，沒有 TTM 概念（跟 bvps/stockPrice 同一種性質）。
export const computeEquityGrowthRate = async (query: QuarterlyMetricQuery, deps: EquityGrowthRateDeps): Promise<EquityGrowthRateComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'fy']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;
  const currentEquity = pickEquity(balanceSheet).value;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await deps.statements.getBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorEquity = pickEquity(priorBalanceSheet).value;

  const { value: growthRate, nullReason } = calculateYoyGrowthRateBigint(currentEquity, priorEquity);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'equityGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  // 2026-10-05 年度（FY）：web-nuxt 指標頁要期別切換器（使用者：有頁面要用再做）。年底淨值 vs 去年年底淨值，
  // 數值跟第四季的單季年增率相同，差別是一年一列、公告日用年報（annualReportSlot 的年度／座標規則）。時點量沒有 TTM，不加。
  const annual = await resolveAnnualReportContext({ symbol, rocYear, season: seasonNum, dataType, subsidiaryCompanyId }, deps);
  const fyRocYear = annual ? annual.fiscalYear - 1911 : null;
  const [fyClose, fyOpen] =
    fyRocYear === null ? [null, null] : await Promise.all([fyRocYear, fyRocYear - 1].map((y) => deps.statements.getBalanceSheet({ symbol, year: y, quarter: 4, dataType, subsidiaryCompanyId })));
  const fy = annualReportSlot(annual, { symbol, metricCode: 'equityGrowthRate', dataType, subsidiaryCompanyId }, calculateYoyGrowthRateBigint(pickEquity(fyClose ?? null).value, pickEquity(fyOpen ?? null).value));

  return { symbol, rocYear: year, season, slots: { q, fy } };
};
