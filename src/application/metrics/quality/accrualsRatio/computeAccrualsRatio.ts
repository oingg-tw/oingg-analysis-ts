import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import type { CashFlowFields } from '@/application/ports/financialStatements';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveAverageBalances } from '../../shared/averageBalances';

// 2026-09-22 formulaVersion 2：分母總資產從本季期末改成期間平均（Q 兩點、TTM 5 個季末）——Sloan (1996) 原文就是
// average total assets，見 shared/averageBalances.ts。
export const ACCRUALS_RATIO_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/accrualsRatio.ts 的獨立重新實作。分母固定用本季期末總資產
// （不平均、不加總 TTM），跟 ROE/ROA 用期末值同一種簡化。
//
// 2026-09-11：抽出 resolveAccrualsRatioInputs()，回傳原始欄位（附帶實際命中哪個
// fieldKey）+ 完整計算過程，給 getAccrualsRatioProvenance.ts（GET /companies/:symbol/
// metric-provenance 的 accrualsRatio 試點）共用，寫入路徑（computeAndWriteAccrualsRatioPit）
// 本身行為完全不變，只是內部改呼叫這個 resolver。

export interface AccrualsRatioTtmQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  netIncome: PickedField;
  cashFlow: CashFlowFields | null;
}

export interface AccrualsRatioResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  totalAssets: bigint | null;
  totalAssetsAvgQ: bigint | null;
  totalAssetsAvgTtm: bigint | null;
  ttmQuarterDetails: AccrualsRatioTtmQuarterDetail[];
  ttmComplete: boolean;
  ttmValue: number | null;
  ttmNullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
  ttmAnchor: KnowledgeDateResolution | null;
}

export const resolveAccrualsRatioInputs = async (
  query: QuarterlyMetricQuery,
  deps: AccrualsRatioDeps
): Promise<AccrualsRatioResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    deps.statements.getBalanceSheet(key),
    deps.statements.getIncomeStatement(key),
    deps.statements.getCashFlowStatement(key),
  ]);

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const totalAssetsAvgQ = balances.assetsAvgQ;
  const totalAssetsAvgTtm = balances.assetsAvgTtm;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  // TTM：近四季（含本季）淨利/OCF/ICF 各自加總，分母是近四季窗口 5 個季末總資產的平均（2026-09-22 起）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  const ttmQuarterDetails: AccrualsRatioTtmQuarterDetail[] = ttmQuarters.map((tq, i) => ({
    rocYear: Number(tq.year),
    season: Number(tq.season),
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    netIncome: pickNetIncome(ttmRecords[i]![0]),
    cashFlow: ttmRecords[i]![1],
  }));

  let netIncomeTtmSum = 0n;
  let ocfTtmSum = 0n;
  let icfTtmSum = 0n;
  let ttmComplete = true;
  for (const detail of ttmQuarterDetails) {
    const cashFlowRecord = detail.cashFlow;
    if (detail.netIncome.value === null || cashFlowRecord === null || cashFlowRecord.netCashFromOperatingActivities === null || cashFlowRecord.netCashFromInvestingActivities === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += detail.netIncome.value;
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
      icfTtmSum += cashFlowRecord.netCashFromInvestingActivities;
    }
  }

  const accrualsTtm = ttmComplete ? netIncomeTtmSum - ocfTtmSum - icfTtmSum : null;
  const ttmValue = accrualsTtm !== null && totalAssetsAvgTtm !== null ? toPercent(accrualsTtm, totalAssetsAvgTtm) : null;
  const ttmNullReason: MetricNullReason | null =
    ttmValue !== null ? null : !ttmComplete || (totalAssetsAvgTtm === null && totalAssets !== null) ? 'insufficient_history' : determineNullReason(accrualsTtm, totalAssetsAvgTtm ?? totalAssets);

  const ttmAnchor = ttmComplete
    ? await resolveKnowledgeDate(
        symbol,
        ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null })), deps.announcements
      )
    : null;

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, totalAssets, totalAssetsAvgQ, totalAssetsAvgTtm, ttmQuarterDetails, ttmComplete, ttmValue, ttmNullReason, mainAnchor, ttmAnchor };
};


export type AccrualsRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type AccrualsRatioComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeAccrualsRatio = async (
  query: QuarterlyMetricQuery,
  deps: AccrualsRatioDeps
): Promise<AccrualsRatioComputationBatch> => {
  const resolution = await resolveAccrualsRatioInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['q', 'ttm']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, totalAssets, totalAssetsAvgQ, ttmQuarterDetails, ttmComplete, ttmValue, ttmNullReason, mainAnchor, ttmAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'accrualsRatio', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  // Q 只用本季（TTM 明細裡的最後一筆就是本季）。
  const currentQuarter = ttmQuarterDetails[ttmQuarterDetails.length - 1]!;
  const currentCashFlow = currentQuarter.cashFlow;
  const accrualsQuarterly =
    currentQuarter.netIncome.value !== null && currentCashFlow?.netCashFromOperatingActivities != null && currentCashFlow?.netCashFromInvestingActivities != null
      ? currentQuarter.netIncome.value - currentCashFlow.netCashFromOperatingActivities - currentCashFlow.netCashFromInvestingActivities
      : null;
  const accrualsRatioQuarterly = accrualsQuarterly !== null && totalAssetsAvgQ !== null ? toPercent(accrualsQuarterly, totalAssetsAvgQ) : null;
  const quarterlyNullReason: MetricNullReason | null =
    accrualsRatioQuarterly !== null ? null : accrualsQuarterly !== null && totalAssetsAvgQ === null && totalAssets !== null ? 'insufficient_history' : determineNullReason(accrualsQuarterly, totalAssetsAvgQ ?? totalAssets);

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', accrualsRatioQuarterly, quarterlyNullReason);

  let ttm: ComputationSlot;
  if (ttmComplete) {
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

  const versioned = (slot: ComputationSlot): ComputationSlot => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: ACCRUALS_RATIO_FORMULA_VERSION });
  return { symbol, rocYear, season, slots: { q: versioned(q), ttm: versioned(ttm) } };
};
