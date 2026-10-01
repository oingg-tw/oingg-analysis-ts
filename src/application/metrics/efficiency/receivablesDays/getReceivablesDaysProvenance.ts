import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveTurnoverRatioFamilyData, type TurnoverRatioFamilyDeps } from '../turnoverRatio/computeTurnoverRatioFamily';
import { TURNOVER_BALANCES, ttmFlowEntries } from '../turnoverRatio/turnoverRatioProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——receivablesDays(DSO) = 365 / 應收帳款周轉率(TTM)，
// 是 receivablesTurnover 的衍生轉換，見 getInventoryDaysProvenance.ts 同一個模式的說明。
// 2026-10-01 改用 computeTurnoverRatioFamily 的 resolveTurnoverRatioFamilyData()（同一份資料與計算，見 turnoverRatioProvenanceEntries.ts）：
// 周轉率的分母 2026-09-22 起是平均應收帳款，原本這裡用本季期末值，溯源值跟儲存值對不上。

export const getReceivablesDaysProvenance = async (query: QuarterlyMetricQuery, deps: TurnoverRatioFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveTurnoverRatioFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'receivablesDays', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'receivablesDays',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ttm.receivablesDays.value,
    entries: [
      ...ttmFlowEntries(r, 'operatingRevenue'),
      ...averageBalanceEntries(r.balances, [TURNOVER_BALANCES.receivable]),
      averagedDenominatorEntry('平均應收帳款', r.balances, r.avg.receivableTtm),
    ],
    methodologyNote: `DSO = 365 ÷ 應收帳款周轉率(TTM)，周轉率本身 = 近一年營收 ÷ 平均應收帳款（近四季窗口 5 個季末平均，興櫃半年頻 3 點，見上方逐點列出），這裡不是查回一組獨立的原始欄位。周轉率(TTM)＝${r.ttm.receivablesTurnover.value ?? 'null'}。`,
  };
};
