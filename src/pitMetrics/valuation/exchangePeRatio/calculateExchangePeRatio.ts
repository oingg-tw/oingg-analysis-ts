import type { CalcResult } from '@/pitMetrics/numericHelpers';

// exchangePeRatio——直接沿用 TWSE/TPEx 官方每日公布的本益比，不自己重算，見
// pitMetrics/shared/marketRatios/computeMarketRatiosPit.ts 檔頭的方法論說明。這是外部黑盒
// 數字，沒有分子分母可以判斷是不是「分母為零」，查無資料一律視為 missing_input。
export const calculateExchangePeRatio = (peRatio: number | null): CalcResult => ({ value: peRatio, nullReason: peRatio === null ? 'missing_input' : null });
