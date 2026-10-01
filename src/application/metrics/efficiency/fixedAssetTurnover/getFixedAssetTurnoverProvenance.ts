import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveTurnoverRatioFamilyData, type TurnoverRatioFamilyDeps } from '../turnoverRatio/computeTurnoverRatioFamily';
import { TURNOVER_BALANCES, ttmFlowEntries } from '../turnoverRatio/turnoverRatioProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——fixedAssetTurnover = 營收(TTM) / 平均不動產廠房及設備。固定回傳 TTM。
// 2026-10-01 改用 computeTurnoverRatioFamily 的 resolveTurnoverRatioFamilyData()（同一份資料與計算，見 turnoverRatioProvenanceEntries.ts）：
// 分母 2026-09-22 起是平均值（v2），原本這裡用本季期末值，溯源值跟儲存值對不上。

export const getFixedAssetTurnoverProvenance = async (query: QuarterlyMetricQuery, deps: TurnoverRatioFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveTurnoverRatioFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'fixedAssetTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'fixedAssetTurnover',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ttm.fixedAssetTurnover.value,
    entries: [
      ...ttmFlowEntries(r, 'operatingRevenue'),
      ...averageBalanceEntries(r.balances, [TURNOVER_BALANCES.ppe]),
      averagedDenominatorEntry('平均不動產廠房及設備', r.balances, r.avg.ppeTtm),
    ],
    methodologyNote: '固定資產周轉率(TTM) = 近一年營收 ÷ 平均不動產廠房及設備，平均值取近四季窗口 5 個季末的平均（興櫃半年頻 3 點，見上方逐點列出）。',
  };
};
