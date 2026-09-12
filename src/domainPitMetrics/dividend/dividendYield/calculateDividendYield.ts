import type { CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// dividendYield——直接沿用 TWSE/TPEx 官方每日公布的殖利率，不自己重算，見
// pitMetrics/shared/marketRatios/computeMarketRatiosPit.ts 檔頭的方法論說明。
export const calculateDividendYield = (dividendYield: number | null): CalcResult => ({ value: dividendYield, nullReason: dividendYield === null ? 'missing_input' : null });
