import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveTurnoverRatioFamilyData, type TurnoverRatioFamilyDeps } from '../turnoverRatio/computeTurnoverRatioFamily';
import { ttmFlowEntries } from '../turnoverRatio/turnoverRatioProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——receivablesToRevenueRatio = 本季期末應收帳款 / 營收(TTM) × 100。
// 這支語意本來就是「現在的水位相對年營收」，compute 刻意維持期末值（v1，見 computeTurnoverRatioFamily.ts），不跟週轉率一起改平均。
// 2026-10-01 改用 computeTurnoverRatioFamily 的 resolveTurnoverRatioFamilyData()（同一份資料與計算，見 turnoverRatioProvenanceEntries.ts）：
// 這支數字本來就對得上，改讀 compute 的結果只是讓 12 支共用同一份來源，之後不會再各自漂移。

export const getReceivablesToRevenueRatioProvenance = async (query: QuarterlyMetricQuery, deps: TurnoverRatioFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveTurnoverRatioFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'receivablesToRevenueRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'receivablesToRevenueRatio',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ttm.receivablesToRevenueRatio.value,
    entries: [
      { role: '本季期末應收帳款', fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'accounts_receivable_net', sourceDescription: null, value: toProvenanceEntryValue(r.accountsReceivable) },
      ...ttmFlowEntries(r, 'operatingRevenue'),
    ],
    methodologyNote: null,
  };
};
