import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveTurnoverRatioFamilyData, type TurnoverRatioFamilyDeps } from '../turnoverRatio/computeTurnoverRatioFamily';
import { TURNOVER_BALANCES, ttmFlowEntries } from '../turnoverRatio/turnoverRatioProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——inventoryTurnover = 營業成本(TTM) / 平均存貨。固定回傳 TTM。
// 2026-10-01 改用 computeTurnoverRatioFamily 的 resolveTurnoverRatioFamilyData()（同一份資料與計算，見 turnoverRatioProvenanceEntries.ts）：
// 分母 2026-09-22 起是平均存貨（v2），原本這裡用本季期末存貨，溯源值跟儲存值對不上。

export const getInventoryTurnoverProvenance = async (query: QuarterlyMetricQuery, deps: TurnoverRatioFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveTurnoverRatioFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'inventoryTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'inventoryTurnover',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ttm.inventoryTurnover.value,
    entries: [
      ...ttmFlowEntries(r, 'operatingCost'),
      ...averageBalanceEntries(r.balances, [TURNOVER_BALANCES.inventory]),
      averagedDenominatorEntry('平均存貨', r.balances, r.avg.inventoryTtm),
    ],
    methodologyNote: '存貨周轉率(TTM) = 近一年營業成本 ÷ 平均存貨，平均存貨取近四季窗口 5 個季末的平均（興櫃半年頻 3 點，見上方逐點列出）。',
  };
};
