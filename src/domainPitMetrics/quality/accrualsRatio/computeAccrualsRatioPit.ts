import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { determineNullReason, toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domainPitMetrics/shared/pickers';
import type { CashFlowFields } from '@/models/cashFlowStatementXbrlFirst';
import { financialDataAdapter, type BalanceSheetPort, type IncomeStatementPort, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';

import { writeOrSkip, writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

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
  ttmQuarterDetails: AccrualsRatioTtmQuarterDetail[];
  ttmComplete: boolean;
  ttmValue: number | null;
  ttmNullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
  ttmAnchor: KnowledgeDateResolution | null;
}

export const resolveAccrualsRatioInputs = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & BalanceSheetPort & CashFlowStatementPort = financialDataAdapter
): Promise<AccrualsRatioResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    statements.getBalanceSheet(key),
    statements.getIncomeStatement(key),
    statements.getCashFlowStatement(key),
  ]);

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  // TTM：近四季（含本季）淨利/OCF/ICF 各自加總，分母固定用本季期末總資產。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
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
  const ttmValue = accrualsTtm !== null && totalAssets !== null ? toPercent(accrualsTtm, totalAssets) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(accrualsTtm, totalAssets) : 'insufficient_history';

  const ttmAnchor = ttmComplete
    ? await resolveKnowledgeDate(
        symbol,
        ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null }))
      )
    : null;

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, totalAssets, ttmQuarterDetails, ttmComplete, ttmValue, ttmNullReason, mainAnchor, ttmAnchor };
};

export type AccrualsRatioPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteAccrualsRatioPit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & BalanceSheetPort & CashFlowStatementPort = financialDataAdapter
): Promise<AccrualsRatioPitOutcome> => {
  const resolution = await resolveAccrualsRatioInputs(query, statements);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, totalAssets, ttmQuarterDetails, ttmComplete, ttmValue, ttmNullReason, mainAnchor, ttmAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'accrualsRatio', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  // Q 只用本季（TTM 明細裡的最後一筆就是本季）。
  const currentQuarter = ttmQuarterDetails[ttmQuarterDetails.length - 1]!;
  const currentCashFlow = currentQuarter.cashFlow;
  const accrualsQuarterly =
    currentQuarter.netIncome.value !== null && currentCashFlow?.netCashFromOperatingActivities != null && currentCashFlow?.netCashFromInvestingActivities != null
      ? currentQuarter.netIncome.value - currentCashFlow.netCashFromOperatingActivities - currentCashFlow.netCashFromInvestingActivities
      : null;
  const accrualsRatioQuarterly = accrualsQuarterly !== null && totalAssets !== null ? toPercent(accrualsQuarterly, totalAssets) : null;
  const quarterlyNullReason: MetricNullReason | null = accrualsRatioQuarterly === null ? determineNullReason(accrualsQuarterly, totalAssets) : null;

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', accrualsRatioQuarterly, quarterlyNullReason);

  let ttm: BasisOutcome;
  if (ttmComplete) {
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
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

  return { symbol, rocYear, season, q, ttm };
};
