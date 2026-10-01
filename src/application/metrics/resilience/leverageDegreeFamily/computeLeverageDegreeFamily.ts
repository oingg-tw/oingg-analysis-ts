import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeValue as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 3：跨期比較的每股數字做面額還原（股票分割不算每股價值變化，IAS 33 追溯調整前期；使用者：「盡可能反映內在價值的變化」）。
// 2026-09-28 formulaVersion 4：跨期還原加上股票股利（配股）與股數合併式減資（使用者：「只是股數變了、公司價值沒變」的都換算，IAS 33 對配股、分割、反分割都追溯調整）。
export const LEVERAGE_DEGREE_FORMULA_VERSION = 4;

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——財務槓桿度
// （DFL）＝%ΔEPS÷%ΔEBIT、總槓桿度（DTL）＝%ΔEPS÷%ΔRevenue，本季 vs 去年同季（YoY），
// 只需要 5 季（本季+去年同季）就夠，不用跨 3 年以上。%Δ 計算方式沿用
// revenueGrowthRate/computeRevenueGrowthRatePit.ts 的既有慣例（去年同季用
// getPastNQuarters({rocYear,season},5)[0]，分母為 0 時該項 %Δ 是 null）。只有 Q 一種
// basis（YoY 比較本質上是單季對單季，不疊加 TTM）。

const growthPct = (current: number | null, prior: number | null): number | null =>
  current !== null && prior !== null && prior !== 0 ? Math.round(((current - prior) / Math.abs(prior)) * 100 * 100) / 100 : null;


export type LeverageDegreeFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type LeverageDegreeFamilyComputationBatch = ComputationBatch<'financialLeverageDegree' | 'totalLeverageDegree'>;

// 2026-10-01 溯源表（getFinancialLeverageDegreeProvenance／getTotalLeverageDegreeProvenance）要跟寫入路徑算出同一個數字：原本兩支
// 共用另一份 resolveLeverageDegreeProvenanceInputs 自己重算，去年同季 EPS 沒做面額／配股還原（v3/v4），1235 這類有配股的公司
// 對不上。那份已刪除，查詢與兩個值改由這支 resolver 提供，computeLeverageDegreeFamily 只負責 knowledge date 與組 slot；計算本身逐字未改。
export const resolveLeverageDegreeInputs = async (query: QuarterlyMetricQuery, deps: LeverageDegreeFamilyDeps) => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return null;
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const currentIncomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = currentIncomeStatement?.reportDate ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await deps.statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });

  const currentShares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const priorShares = priorIncomeStatement?.reportDate ? await deps.shares.getOutstandingCommonShares(symbol, priorIncomeStatement.reportDate) : null;

  const currentNetIncome = pickNetIncome(currentIncomeStatement);
  const priorNetIncome = pickNetIncome(priorIncomeStatement);
  const currentEps = currentNetIncome !== null && currentShares !== null ? toPerShare(currentNetIncome, currentShares.outstandingCommonShares) : null;
  const splitFactor = priorIncomeStatement?.reportDate && reportDate ? await deps.shares.getShareSplitFactor(symbol, priorIncomeStatement.reportDate, reportDate) : 1;
  const priorEpsRaw = priorNetIncome !== null && priorShares !== null ? toPerShare(priorNetIncome, priorShares.outstandingCommonShares) : null;
  const priorEps = priorEpsRaw === null ? null : priorEpsRaw / splitFactor;

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

  return {
    symbol, year, season, rocYear, seasonNum, fiscalYear, reportDate,
    prior, currentIncomeStatement, priorIncomeStatement, currentShares, priorShares, currentEps, priorEpsRaw, splitFactor, priorEps,
    epsGrowth, ebitGrowth, revenueGrowth, dfl, dflNullReason, dtl, dtlNullReason,
  };
};

export const computeLeverageDegreeFamily = async (query: QuarterlyMetricQuery, deps: LeverageDegreeFamilyDeps): Promise<LeverageDegreeFamilyComputationBatch> => {
  const { dataType, subsidiaryCompanyId } = query;
  const resolution = await resolveLeverageDegreeInputs(query, deps);

  if (!resolution) {
    return noQuarterBatch(query.symbol, ['financialLeverageDegree', 'totalLeverageDegree']);
  }

  const { symbol, year, season, rocYear, seasonNum, fiscalYear, reportDate, dfl, dflNullReason, dtl, dtlNullReason } = resolution;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let financialLeverageDegree: ComputationSlot;
  let totalLeverageDegree: ComputationSlot;
  if (!mainAnchor) {
    financialLeverageDegree = { action: 'skipped_no_knowledge_date' };
    totalLeverageDegree = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    financialLeverageDegree = computation({ ...coordinateFor('financialLeverageDegree'), ...periodTypeGroup('Q'), value: dfl, nullReason: dflNullReason, knowledgeDate, knowledgeDateIsFallback });
    totalLeverageDegree = computation({ ...coordinateFor('totalLeverageDegree'), ...periodTypeGroup('Q'), value: dtl, nullReason: dtlNullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ financialLeverageDegree, totalLeverageDegree }, LEVERAGE_DEGREE_FORMULA_VERSION) };
};
