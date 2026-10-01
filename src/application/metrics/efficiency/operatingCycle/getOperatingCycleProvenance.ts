import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveTurnoverRatioFamilyData, type TurnoverRatioFamilyDeps } from '../turnoverRatio/computeTurnoverRatioFamily';
import { TURNOVER_BALANCES, ttmFlowEntries } from '../turnoverRatio/turnoverRatioProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——operatingCycle = DIO + DSO（不扣 DPO，跟 cashConversionCycle 差異是不考慮付款緩衝期），
// 見 getCashConversionCycleProvenance.ts 同一個模式的說明，只是少了應付帳款那組欄位。
// 2026-10-01 改用 computeTurnoverRatioFamily 的 resolveTurnoverRatioFamilyData()（同一份資料與計算，見 turnoverRatioProvenanceEntries.ts）：
// 兩個周轉率的分母 2026-09-22 起都是平均值，原本這裡用本季期末值，溯源值跟儲存值對不上。

export const getOperatingCycleProvenance = async (query: QuarterlyMetricQuery, deps: TurnoverRatioFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveTurnoverRatioFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'operatingCycle', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'operatingCycle',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ttm.operatingCycle.value,
    entries: [
      ...ttmFlowEntries(r, 'operatingCost', '，用於 DIO'),
      ...ttmFlowEntries(r, 'operatingRevenue', '，用於 DSO'),
      ...averageBalanceEntries(r.balances, [TURNOVER_BALANCES.inventory, TURNOVER_BALANCES.receivable]),
      averagedDenominatorEntry('平均存貨', r.balances, r.avg.inventoryTtm),
      averagedDenominatorEntry('平均應收帳款', r.balances, r.avg.receivableTtm),
    ],
    methodologyNote: `營運週期 = DIO + DSO。DIO(TTM)＝${r.ttm.inventoryDays.value ?? 'null'}，DSO(TTM)＝${r.ttm.receivablesDays.value ?? 'null'}——兩者各自是對應周轉率(TTM)的 365/x 轉換，周轉率的分母是平均存貨／應收（近四季窗口 5 個季末平均，興櫃半年頻 3 點，見上方逐點列出），不是查回兩組獨立資料。`,
  };
};
