import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type IncomeStatementPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——財務槓桿度
// （DFL）＝%ΔEPS÷%ΔEBIT、總槓桿度（DTL）＝%ΔEPS÷%ΔRevenue，本季 vs 去年同季（YoY），
// 只需要 5 季（本季+去年同季）就夠，不用跨 3 年以上。%Δ 計算方式沿用
// revenueGrowthRate/computeRevenueGrowthRatePit.ts 的既有慣例（去年同季用
// getPastNQuarters({rocYear,season},5)[0]，分母為 0 時該項 %Δ 是 null）。只有 Q 一種
// basis（YoY 比較本質上是單季對單季，不疊加 TTM）。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  if (record.netIncome !== null) return record.netIncome;
  return null;
};

const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

const growthPct = (current: number | null, prior: number | null): number | null =>
  current !== null && prior !== null && prior !== 0 ? Math.round(((current - prior) / Math.abs(prior)) * 100 * 100) / 100 : null;

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface LeverageDegreeFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  financialLeverageDegree: BasisOutcome;
  totalLeverageDegree: BasisOutcome;
}

export const computeAndWriteLeverageDegreeFamilyPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort & PaidInSharesPort = financialDataAdapter): Promise<LeverageDegreeFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, financialLeverageDegree: { action: 'skipped_no_quarter' }, totalLeverageDegree: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const currentIncomeStatement = await statements.getIncomeStatement(key);
  const reportDate = currentIncomeStatement?.reportDate ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });

  const currentShares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;
  const priorShares = priorIncomeStatement?.reportDate ? await statements.getPaidInShares(symbol, priorIncomeStatement.reportDate) : null;

  const currentNetIncome = pickNetIncome(currentIncomeStatement);
  const priorNetIncome = pickNetIncome(priorIncomeStatement);
  const currentEps = currentNetIncome !== null && currentShares !== null ? toPerShare(currentNetIncome, currentShares.paidInShares) : null;
  const priorEps = priorNetIncome !== null && priorShares !== null ? toPerShare(priorNetIncome, priorShares.paidInShares) : null;

  const currentEbit = currentIncomeStatement?.operatingIncome ?? null;
  const priorEbit = priorIncomeStatement?.operatingIncome ?? null;
  const currentRevenue = currentIncomeStatement?.operatingRevenue ?? null;
  const priorRevenue = priorIncomeStatement?.operatingRevenue ?? null;

  const epsGrowth = growthPct(currentEps, priorEps);
  const ebitGrowth = growthPct(currentEbit !== null ? Number(currentEbit) : null, priorEbit !== null ? Number(priorEbit) : null);
  const revenueGrowth = growthPct(currentRevenue !== null ? Number(currentRevenue) : null, priorRevenue !== null ? Number(priorRevenue) : null);

  const dfl = epsGrowth !== null && ebitGrowth !== null && ebitGrowth !== 0 ? Math.round((epsGrowth / ebitGrowth) * 100) / 100 : null;
  const dflNullReason: MetricNullReason | null =
    dfl !== null ? null : epsGrowth === null || ebitGrowth === null ? 'missing_input' : 'zero_or_negative_denominator';

  const dtl = epsGrowth !== null && revenueGrowth !== null && revenueGrowth !== 0 ? Math.round((epsGrowth / revenueGrowth) * 100) / 100 : null;
  const dtlNullReason: MetricNullReason | null =
    dtl !== null ? null : epsGrowth === null || revenueGrowth === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let financialLeverageDegree: BasisOutcome;
  let totalLeverageDegree: BasisOutcome;
  if (!mainAnchor) {
    financialLeverageDegree = { action: 'skipped_no_knowledge_date' };
    totalLeverageDegree = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    financialLeverageDegree = await writeMetricValue({ ...coordinateFor('financialLeverageDegree'), ...periodTypeGroup('Q'), value: dfl, nullReason: dflNullReason, knowledgeDate, knowledgeDateIsFallback });
    totalLeverageDegree = await writeMetricValue({ ...coordinateFor('totalLeverageDegree'), ...periodTypeGroup('Q'), value: dtl, nullReason: dtlNullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  return { symbol, rocYear: year, season, financialLeverageDegree, totalLeverageDegree };
};
