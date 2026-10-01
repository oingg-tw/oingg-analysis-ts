import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveTurnoverRatioFamilyData, type TurnoverRatioFamilyDeps } from '../turnoverRatio/computeTurnoverRatioFamily';
import { TURNOVER_BALANCES, ttmFlowEntries } from '../turnoverRatio/turnoverRatioProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——netWorkingCapitalTurnover = 營收(TTM) / 平均淨營運資金，淨營運資金 = 流動資產 − 流動負債
// （本身不是財報原始欄位，稽核鏈每一點分開列出流動資產/流動負債兩筆原始欄位，不是只列相減後的淨值）。
// 2026-10-01 改用 computeTurnoverRatioFamily 的 resolveTurnoverRatioFamilyData()（同一份資料與計算，見 turnoverRatioProvenanceEntries.ts）：
// 分母 2026-09-22 起是 5 個季末淨營運資金的平均（v2），原本這裡用本季期末值，溯源值跟儲存值對不上。

export const getNetWorkingCapitalTurnoverProvenance = async (query: QuarterlyMetricQuery, deps: TurnoverRatioFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveTurnoverRatioFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'netWorkingCapitalTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'netWorkingCapitalTurnover',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ttm.netWorkingCapitalTurnover.value,
    entries: [
      ...ttmFlowEntries(r, 'operatingRevenue'),
      ...averageBalanceEntries(r.balances, [TURNOVER_BALANCES.currentAssets, TURNOVER_BALANCES.currentLiabilities]),
      averagedDenominatorEntry('平均淨營運資金（流動資產 − 流動負債）', r.balances, r.avg.netWorkingCapitalTtm),
    ],
    methodologyNote: '分母淨營運資金 = 流動資產 − 流動負債（每一點兩筆原始欄位相減，本身不是財報原始欄位），取近四季窗口 5 個季末的平均（興櫃半年頻 3 點，見上方逐點列出）。',
  };
};
