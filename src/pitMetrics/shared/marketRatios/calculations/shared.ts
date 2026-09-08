import type { MetricNullReason } from '../../../metricBasis';

export interface CalcResult {
  value: number | null;
  nullReason: MetricNullReason | null;
}

// 三個欄位（exchangePeRatio/exchangePbRatio/dividendYield）共用同一個判斷：
// daily_valuation 該欄位本身是 null（例如虧損公司沒有 PER），一律視為 missing_input——
// 這是外部黑盒數字（TWSE/TPEx 官方每日公布，本服務不重算），沒有分子分母可以判斷是不是
// 「分母為零」。
export const passthroughFromDailyValuation = (value: number | null): CalcResult => ({ value, nullReason: value === null ? 'missing_input' : null });
