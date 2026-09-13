import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveDividendPayoutRatioInputs } from './computeDividendPayoutRatioPit';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-11 web-nuxt 要求（第二批試點）：GET /companies/:symbol/metric-provenance 的
// dividendPayoutRatio 試點，現查現算不持久化。TTM basis（badge 用的 timeframe）需要 4 季 ×
// （淨利 + 股利發放）= 8 筆，都是真實可對照的原始欄位，不像 sue 需要截斷，全部列出。
// 股利發放缺漏視為 0（大多數季度本來就沒發放，不是資料缺漏）——這種情況 entry 的 value
// 仍然如實顯示 null（原始欄位真的是 null），不偷偷改成 0，跟寫入路徑「加總時當 0」是
// 兩件事：這裡呈現的是原始事實，不是計算過程中的替代值。


export const getDividendPayoutRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveDividendPayoutRatioInputs(query);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'dividendPayoutRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, ttmQuarterDetails, payoutRatioTtm } = resolution;

  const entries: ProvenanceEntry[] = ttmQuarterDetails.flatMap((detail, i): ProvenanceEntry[] => {
    const label = `TTM 第 ${i + 1}/4 季`;
    const netIncomeEntry: ProvenanceEntry = {
      role: `${label}淨利（歸屬母公司）`,
      fiscalYear: detail.fiscalYear,
      fiscalQuarter: detail.season,
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey: detail.netIncome.fieldKey,
      sourceDescription: null,
      value: toProvenanceEntryValue(detail.netIncome.value),
    };
    const dividendsPaidEntry: ProvenanceEntry = {
      role: `${label}發放現金股利`,
      fiscalYear: detail.fiscalYear,
      fiscalQuarter: detail.season,
      type: 'statementField',
      statementType: 'cashFlowStatement',
      fieldKey: 'dividends_paid_financing',
      sourceDescription: null,
      value: toProvenanceEntryValue(detail.cashFlow?.dividendsPaid ?? null),
    };
    return [netIncomeEntry, dividendsPaidEntry];
  });

  return {
    symbol,
    metricCode: 'dividendPayoutRatio',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: payoutRatioTtm,
    entries,
    methodologyNote: '股利發放（dividends_paid_financing）為 null 的季度視為當季沒有發放（計算時當 0 加總），不是資料缺漏；entries 裡如實顯示原始欄位的 null 值，不做替代。',
  };
};
