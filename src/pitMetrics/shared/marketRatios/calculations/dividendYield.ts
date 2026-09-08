import { passthroughFromDailyValuation, type CalcResult } from './shared';

// dividendYield——直接沿用 TWSE/TPEx 官方每日公布的殖利率，不自己重算。
export const calculateDividendYield = (dividendYield: number | null): CalcResult => passthroughFromDailyValuation(dividendYield);
