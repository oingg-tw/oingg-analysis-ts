import type { CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// exchangePbRatio——直接沿用 TWSE/TPEx 官方每日公布的股價淨值比，不自己重算，見
// pitMetrics/shared/marketRatios/computeMarketRatiosPit.ts 檔頭的方法論說明。
export const calculateExchangePbRatio = (pbRatio: number | null): CalcResult => ({ value: pbRatio, nullReason: pbRatio === null ? 'missing_input' : null });
