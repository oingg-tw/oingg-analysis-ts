import { toPercent, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// 五年權益加權 ROE 的純計算：netIncomes 是五個年度的全年淨利（舊到新），yearEndEquities 是六個年底權益（窗口前一年底到最後一年底，舊到新），
// 第 i 年的平均權益 = (yearEndEquities[i] + yearEndEquities[i+1]) / 2。任一缺漏 → insufficient_history。
export const ROE_WEIGHTED_YEARS = 5;

export const calculateRoeWeighted5y = (netIncomes: (bigint | null)[], yearEndEquities: (bigint | null)[]): CalcResult => {
  if (netIncomes.length !== ROE_WEIGHTED_YEARS || yearEndEquities.length !== ROE_WEIGHTED_YEARS + 1) return { value: null, nullReason: 'insufficient_history' };
  if (netIncomes.some((v) => v === null) || yearEndEquities.some((v) => v === null)) return { value: null, nullReason: 'insufficient_history' };
  const income = (netIncomes as bigint[]).reduce((a, b) => a + b, 0n);
  // 每年 (期初＋期末)/2 再相加 = (Σ 各年期初＋期末)/2；整數除法只在最後做一次，避免逐年截斷累積誤差。
  const equities = yearEndEquities as bigint[];
  let doubledEquity = 0n;
  for (let i = 0; i < ROE_WEIGHTED_YEARS; i++) doubledEquity += equities[i]! + equities[i + 1]!;
  // 五年平均權益合計 ≤ 0（累積虧損到權益為負）比率沒有意義，明確擋掉，不沿用 toPercent「負分母照算」的行為。
  if (doubledEquity <= 0n) return { value: null, nullReason: 'zero_or_negative_denominator' };
  return { value: toPercent(income * 2n, doubledEquity), nullReason: null };
};
