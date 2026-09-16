import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domainPitMetrics/shared/pickers';
import type { CashFlowFields } from '@/models/mops/cashFlowStatementXbrlFirst';
import { financialDataAdapter, type IncomeStatementPort, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/dividendPayoutRatio.ts 的獨立重新實作。只有 TTM 一種
// basis——股利通常一年發放 1-2 次，單季配息率會嚴重失真，舊架構本來就沒有 Q/Q_ANN。
//
// 2026-09-11：抽出 resolveDividendPayoutRatioInputs()，回傳原始欄位（附帶實際命中哪個
// fieldKey）+ 完整計算過程，給 getDividendPayoutRatioProvenance.ts（GET /companies/
// :symbol/metric-provenance 的 dividendPayoutRatio 試點）共用，寫入路徑
// （computeAndWriteDividendPayoutRatioPit）本身行為完全不變，只是內部改呼叫這個 resolver。

export interface DividendPayoutRatioTtmQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  netIncome: PickedField;
  cashFlow: CashFlowFields | null;
}

export interface DividendPayoutRatioResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  ttmQuarterDetails: DividendPayoutRatioTtmQuarterDetail[];
  ttmComplete: boolean;
  payoutRatioTtm: number | null;
  ttmNullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
  ttmAnchor: KnowledgeDateResolution | null;
}

export const resolveDividendPayoutRatioInputs = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & CashFlowStatementPort = financialDataAdapter
): Promise<DividendPayoutRatioResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, cashFlowStatement] = await Promise.all([statements.getIncomeStatement(key), statements.getCashFlowStatement(key)]);
  const reportDate = incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  // TTM：近四季（含本季）淨利加總、股利發放加總——股利發放缺漏視為 0（大多數季度本來就沒發放，
  // 不是資料缺漏），只有淨利缺漏才讓這一季不齊，見 dividendPayoutRatio.ts 的既有邏輯。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  const ttmQuarterDetails: DividendPayoutRatioTtmQuarterDetail[] = ttmQuarters.map((tq, i) => ({
    rocYear: Number(tq.year),
    season: Number(tq.season),
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    netIncome: pickNetIncome(ttmRecords[i]![0]),
    cashFlow: ttmRecords[i]![1],
  }));

  let netIncomeTtmSum = 0n;
  let dividendsPaidTtmSum = 0n;
  let ttmComplete = true;
  for (const detail of ttmQuarterDetails) {
    if (detail.netIncome.value === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += detail.netIncome.value;
      dividendsPaidTtmSum += detail.cashFlow?.dividendsPaid ?? 0n;
    }
  }

  const dividendsPaidAbs = dividendsPaidTtmSum < 0n ? -dividendsPaidTtmSum : dividendsPaidTtmSum;
  const payoutRatioTtm = ttmComplete && netIncomeTtmSum > 0n ? toPercent(dividendsPaidAbs, netIncomeTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = payoutRatioTtm !== null ? null : ttmComplete ? 'zero_or_negative_denominator' : 'insufficient_history';

  const ttmAnchor = ttmComplete
    ? await resolveKnowledgeDate(
        symbol,
        ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null }))
      )
    : null;

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, ttmQuarterDetails, ttmComplete, payoutRatioTtm, ttmNullReason, mainAnchor, ttmAnchor };
};

export type DividendPayoutRatioPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteDividendPayoutRatioPit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & CashFlowStatementPort = financialDataAdapter
): Promise<DividendPayoutRatioPitOutcome> => {
  const resolution = await resolveDividendPayoutRatioInputs(query, statements);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, ttmComplete, payoutRatioTtm, ttmNullReason, mainAnchor, ttmAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'dividendPayoutRatio', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (ttmComplete) {
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: payoutRatioTtm,
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

  return { symbol, rocYear, season, ttm };
};
