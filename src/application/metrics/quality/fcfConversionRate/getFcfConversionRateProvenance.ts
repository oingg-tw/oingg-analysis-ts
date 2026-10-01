import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——fcfConversionRate(TTM) = 近四季自由現金流(FCF=OCF+
// 資本支出)加總 / 近四季淨利加總。純財報比率，不涉及股價/市值。只有 TTM 一種 basis。
//
// 注意：分母淨利固定用整體口徑（incomeRecord.netIncome，fieldKey='profit_loss'），
// 不是其他多數指標慣用的「歸屬母公司優先、缺漏退回整體」pickNetIncome 樣式——這是
// 照抄 computeCashFlowValuationFamilyPit.ts 既有寫入路徑的實際欄位選擇，驗證時發現
// 用 pickNetIncome 會跟已寫入的值有微幅落差（2330 51.12 vs 51.13）才確認的。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs：原本獨立重算，少了寫入路徑
// 2026-09-22 加的淨利 ≤ 0 守門（1101、2002 寫入 zero_or_negative_denominator、溯源卻是負的百分比）跟家族 ttmComplete
// 旗標。值直接取 resolution.values.fcfConversionRate。

export const getFcfConversionRateProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'fcfConversionRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'fcfConversionRate',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.fcfConversionRate,
    entries: cashFlowValuationEntries(r, ['netIncome', 'ocf', 'capex']),
    methodologyNote:
      'FCF = 營業活動現金流 + 資本支出（資本支出帶負號，相加即為扣除），不是財報原始欄位，是計算出的中繼值，見上方原始欄位；近一年淨利 ≤ 0 時轉換率沒有意義，不計算。' +
      cashFlowValuationGateNote(r),
  };
};
