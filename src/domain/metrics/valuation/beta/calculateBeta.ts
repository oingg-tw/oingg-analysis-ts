import type { LookbackRange, SamplingInterval, MetricNullReason } from '../../metricBasis';

// Beta 的純計算部分——2026-09-17 clean architecture 重構 Phase 3 從 application/metrics/valuation/beta/
// computeBetaPit.ts 逐字搬來（公式、降頻、門檻一個字都沒改），application 那邊只剩「查價格序列 →
// 對齊重疊交易日 → 逐窗口呼叫這裡 → 組成寫入資料」的編排。
//
// Beta = Cov(個股報酬率, 加權股價指數報酬率) / Var(加權股價指數報酬率)，四個窗口各自獨立計算
// （各自取基準日往前 N 年的重疊交易日再降頻，不是用短窗口的資料湊長窗口）：1Y 用日資料、
// 2Y/3Y 用週資料（對齊 Bloomberg BETA 頁面）、5Y 用月資料（對齊 Morningstar/S&P 長期 Beta 標準）。

export type BetaSamplingFrequency = 'daily' | 'weekly' | 'monthly';

export interface BetaWindowConfig {
  outputKey: 'beta1YDaily' | 'beta2YWeekly' | 'beta3YWeekly' | 'beta5YMonthly';
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  years: number;
  frequency: BetaSamplingFrequency;
}

export const BETA_WINDOW_CONFIGS: BetaWindowConfig[] = [
  { outputKey: 'beta1YDaily', lookbackRange: '1Y', samplingInterval: '1D', years: 1, frequency: 'daily' },
  { outputKey: 'beta2YWeekly', lookbackRange: '2Y', samplingInterval: '1W', years: 2, frequency: 'weekly' },
  { outputKey: 'beta3YWeekly', lookbackRange: '3Y', samplingInterval: '1W', years: 3, frequency: 'weekly' },
  { outputKey: 'beta5YMonthly', lookbackRange: '5Y', samplingInterval: '1M', years: 5, frequency: 'monthly' },
];

export const BETA_MIN_OBSERVATIONS = 20; // 降頻後至少要有 20 個取樣點（19 個報酬率樣本），跟舊架構同一個門檻。

export interface OverlapPoint {
  tradeDate: string; // YYYY-MM-DD
  stockClose: number;
  indexClose: number;
}

export const toDateString = (d: Date): string => d.toISOString().slice(0, 10);

export const subtractYears = (date: Date, years: number): Date => {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

// ISO 8601 週數（週一為一週開始，該週的週四落在哪個西元年就算哪一年的第幾週）——跟
// domainMetrics/beta.ts 完全相同的分桶邏輯，避免跨年邊界誤判。
const getIsoWeekKey = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const dayNum = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  const firstWeekMonday = new Date(firstThursday);
  firstWeekMonday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum);
  const weekNum = Math.round((thursday.getTime() - firstWeekMonday.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
};

const getMonthKey = (dateStr: string): string => dateStr.slice(0, 7);

export const resample = (points: OverlapPoint[], frequency: BetaSamplingFrequency): OverlapPoint[] => {
  if (frequency === 'daily') return points;
  const keyFn = frequency === 'weekly' ? getIsoWeekKey : getMonthKey;
  const lastByPeriod = new Map<string, OverlapPoint>();
  for (const p of points) {
    lastByPeriod.set(keyFn(p.tradeDate), p);
  }
  return Array.from(lastByPeriod.values());
};

// 樣本共變異數/變異數（分母 n-1）。指數變異數為 0（理論上不會發生但防呆）回傳 null。
export const calculateBetaCoefficient = (stockReturns: number[], indexReturns: number[]): number | null => {
  const n = stockReturns.length;
  if (n < 2) return null;
  const meanStock = mean(stockReturns);
  const meanIndex = mean(indexReturns);
  let covariance = 0;
  let varianceIndex = 0;
  for (let i = 0; i < n; i++) {
    covariance += (stockReturns[i]! - meanStock) * (indexReturns[i]! - meanIndex);
    varianceIndex += (indexReturns[i]! - meanIndex) ** 2;
  }
  covariance /= n - 1;
  varianceIndex /= n - 1;
  if (varianceIndex === 0) return null;
  return Math.round((covariance / varianceIndex) * 10000) / 10000;
};

export interface BetaWindowComputation {
  value: number | null;
  observations: number;
  nullReason: MetricNullReason | null;
}

export const calculateBetaWindow = (points: OverlapPoint[], windowEnd: Date, config: BetaWindowConfig): BetaWindowComputation => {
  const windowStartStr = toDateString(subtractYears(windowEnd, config.years));
  const windowEndStr = toDateString(windowEnd);
  const windowedDaily = points.filter((p) => p.tradeDate >= windowStartStr && p.tradeDate <= windowEndStr);
  const windowed = resample(windowedDaily, config.frequency);

  if (windowed.length < BETA_MIN_OBSERVATIONS) {
    return { value: null, observations: windowed.length, nullReason: 'insufficient_history' };
  }

  const stockReturns: number[] = [];
  const indexReturns: number[] = [];
  for (let i = 1; i < windowed.length; i++) {
    const prev = windowed[i - 1]!;
    const curr = windowed[i]!;
    if (prev.stockClose === 0 || prev.indexClose === 0) continue;
    stockReturns.push((curr.stockClose - prev.stockClose) / prev.stockClose);
    indexReturns.push((curr.indexClose - prev.indexClose) / prev.indexClose);
  }

  const value = calculateBetaCoefficient(stockReturns, indexReturns);
  return { value, observations: windowed.length, nullReason: value === null ? 'zero_or_negative_denominator' : null };
};
