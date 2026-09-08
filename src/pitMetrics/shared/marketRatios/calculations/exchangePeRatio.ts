import { passthroughFromDailyValuation, type CalcResult } from './shared';

// exchangePeRatio——直接沿用 TWSE/TPEx 官方每日公布的本益比，不自己重算，見
// computeMarketRatiosPit.ts 檔頭的方法論說明。
export const calculateExchangePeRatio = (peRatio: number | null): CalcResult => passthroughFromDailyValuation(peRatio);
