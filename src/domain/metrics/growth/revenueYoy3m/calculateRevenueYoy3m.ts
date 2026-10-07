import { calculateYoyGrowthRate, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

export const REVENUE_YOY_3M_MONTHS = 3;
export const REVENUE_YOY_3M_WINDOW_MONTHS = 12 + REVENUE_YOY_3M_MONTHS; // 15：t−14 … t

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

// revenues：由舊到新、連續無缺月的單月營收，長度正好 15，最後一筆是目標月 t。前 3 筆（t−14…t−12）是去年同期、
// 後 3 筆（t−2…t）是本期，中間 9 個月只用來保證窗口連續。任一筆 null → insufficient_history。
export const calculateRevenueYoy3m = (revenues: (number | null)[]): CalcResult => {
  if (revenues.length !== REVENUE_YOY_3M_WINDOW_MONTHS || revenues.some((r) => r === null)) {
    return { value: null, nullReason: 'insufficient_history' };
  }
  const r = revenues as number[];
  return calculateYoyGrowthRate(sum(r.slice(-REVENUE_YOY_3M_MONTHS)), sum(r.slice(0, REVENUE_YOY_3M_MONTHS)));
};
