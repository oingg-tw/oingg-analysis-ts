import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveTurnoverRatioFamilyData, type TurnoverRatioFamilyDeps } from '../turnoverRatio/computeTurnoverRatioFamily';
import { TURNOVER_BALANCES, ttmFlowEntries } from '../turnoverRatio/turnoverRatioProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——cashConversionCycle(CCC) = DIO + DSO − DPO，是三支天數指標（各自又是對應周轉率的
// 衍生轉換）的二階衍生值，見 getInventoryDaysProvenance.ts 同一個模式的說明。稽核鏈列出全部真正的原始欄位（近一年營業成本、
// 營收，存貨/應收帳款/應付帳款的平均分母各點），methodologyNote 說明完整的推導鏈。
// 2026-10-01 改用 computeTurnoverRatioFamily 的 resolveTurnoverRatioFamilyData()（同一份資料與計算，見 turnoverRatioProvenanceEntries.ts）：
// 三個周轉率的分母 2026-09-22 起都是平均值，原本這裡用本季期末值，溯源值跟儲存值對不上。

export const getCashConversionCycleProvenance = async (query: QuarterlyMetricQuery, deps: TurnoverRatioFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveTurnoverRatioFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'cashConversionCycle', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'cashConversionCycle',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ttm.cashConversionCycle.value,
    entries: [
      ...ttmFlowEntries(r, 'operatingCost', '，用於 DIO/DPO'),
      ...ttmFlowEntries(r, 'operatingRevenue', '，用於 DSO'),
      ...averageBalanceEntries(r.balances, [TURNOVER_BALANCES.inventory, TURNOVER_BALANCES.receivable, TURNOVER_BALANCES.payable]),
      averagedDenominatorEntry('平均存貨', r.balances, r.avg.inventoryTtm),
      averagedDenominatorEntry('平均應收帳款', r.balances, r.avg.receivableTtm),
      averagedDenominatorEntry('平均應付帳款', r.balances, r.avg.payableTtm),
    ],
    methodologyNote: `CCC = DIO + DSO − DPO。DIO(TTM)＝${r.ttm.inventoryDays.value ?? 'null'}，DSO(TTM)＝${r.ttm.receivablesDays.value ?? 'null'}，DPO(TTM)＝${r.ttm.payablesDays.value ?? 'null'}——三者各自是對應周轉率(TTM)的 365/x 轉換，周轉率的分母是平均存貨／應收／應付（近四季窗口 5 個季末平均，興櫃半年頻 3 點，見上方逐點列出），不是查回三組獨立資料。`,
  };
};
