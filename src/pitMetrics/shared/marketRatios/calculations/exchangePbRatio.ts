import { passthroughFromDailyValuation, type CalcResult } from './shared';

// exchangePbRatio——直接沿用 TWSE/TPEx 官方每日公布的股價淨值比，不自己重算。
export const calculateExchangePbRatio = (pbRatio: number | null): CalcResult => passthroughFromDailyValuation(pbRatio);
