import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';
import { averageOf, resolveAverageBalances } from '../../shared/averageBalances';

// 2026-09-22 formulaVersion 2：Economic Capital 從本季期末改成近四季窗口 5 個季末的平均，見 shared/averageBalances.ts。
export const CROCI_FORMULA_VERSION = 2;

// 量化選股盤點使用者要求新增，簡化版公式見 crociDefinition.ts 的說明（不做 CROCI 原始
// 方法論的通膨/資本化調整）。Economic Capital = 總資產－流動負債，2026-09-22 起取期間平均（見上方 v2）。


export type CrociDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements'>;

export type CrociComputationBatch = ComputationBatch<'ttm'>;

// 2026-10-01 抽出 resolveCrociData()：溯源表（getCrociProvenance.ts）跟 compute 走同一份資料與計算——溯源表原本自己算
// 本季期末經濟資本，2026-09-22 分母改 5 點平均後就跟儲存值對不上。
export const resolveCrociData = async (query: QuarterlyMetricQuery, deps: CrociDeps) => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const economicCapital = totalAssets !== null && currentLiabilities !== null ? totalAssets - currentLiabilities : null;
  const reportDate = balanceSheet?.reportDate ?? null;
  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const economicCapitalAvgTtm = averageOf(balances, (bs) => (bs.totalAssets !== null && bs.currentLiabilities !== null ? bs.totalAssets - bs.currentLiabilities : null), 'ttm');

  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）；兩張表的 periods 順序相同。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

  const ttmNetIncomes = ttmRecords.map(([incomeRecord]) => pickNetIncome(incomeRecord));

  let grossCashFlowTtmSum = 0n;
  let ttmComplete = true;
  for (const [i, [incomeRecord, cashFlowRecord]] of ttmRecords.entries()) {
    const netIncome = ttmNetIncomes[i]!.value;
    if (netIncome === null || incomeRecord?.financeCosts == null || cashFlowRecord?.depreciation == null || cashFlowRecord?.amortization == null) {
      ttmComplete = false;
    } else {
      grossCashFlowTtmSum += netIncome + incomeRecord.financeCosts + cashFlowRecord.depreciation + cashFlowRecord.amortization;
    }
  }

  const ttmValue = ttmComplete && economicCapitalAvgTtm !== null ? toPercent(grossCashFlowTtmSum, economicCapitalAvgTtm) : null;
  const ttmNullReason: MetricNullReason | null =
    ttmValue !== null ? null : !ttmComplete || (economicCapitalAvgTtm === null && economicCapital !== null) ? 'insufficient_history' : determineNullReason(grossCashFlowTtmSum, economicCapitalAvgTtm ?? economicCapital);

  return { symbol, year, season, rocYear, seasonNum, fiscalYear, reportDate, balances, economicCapitalAvgTtm, basis: trailingIncome.basis, ttmQuarters, ttmRecords, ttmNetIncomes, ttmComplete, ttmValue, ttmNullReason };
};

export const computeCroci = async (query: QuarterlyMetricQuery, deps: CrociDeps): Promise<CrociComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolution = await resolveCrociData(query, deps);
  if (!resolution) return noQuarterBatch(symbol, ['ttm']);

  const { year, season, rocYear, seasonNum, fiscalYear, reportDate, ttmQuarters, ttmRecords, ttmComplete, ttmValue, ttmNullReason } = resolution;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'croci', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, slots: { ttm: isComputationSkip(ttm) ? ttm : { ...ttm, formulaVersion: CROCI_FORMULA_VERSION } } };
};
