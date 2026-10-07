import { expect, test } from 'vitest';
import { calculateRevenueYoy3m } from '@/domain/metrics/growth/revenueYoy3m/calculateRevenueYoy3m';

// 2026-10-07 近三個月累計營收年增率：15 個月窗口，前 3 個月是去年同期、後 3 個月是本期，中間 9 個月不進公式。
const window = (lastYear: number[], middle: number, thisYear: number[]) => [...lastYear, ...Array<number>(9).fill(middle), ...thisYear];

test('(本期 3 個月合計 − 去年同 3 個月合計) / |去年合計| × 100，中間 9 個月不影響', () => {
  expect(calculateRevenueYoy3m(window([100, 100, 100], 1, [110, 120, 130]))).toEqual({ value: 20, nullReason: null });
  expect(calculateRevenueYoy3m(window([100, 100, 100], 999, [110, 120, 130])).value).toBe(20);
});

test('窗口不足 15 個月或任一月 null → insufficient_history；去年合計 0 → zero_or_negative_denominator', () => {
  expect(calculateRevenueYoy3m([100, 100, 100]).nullReason).toBe('insufficient_history');
  const withGap: (number | null)[] = window([100, 100, 100], 1, [110, 120, 130]);
  withGap[5] = null;
  expect(calculateRevenueYoy3m(withGap).nullReason).toBe('insufficient_history');
  expect(calculateRevenueYoy3m(window([0, 0, 0], 1, [10, 10, 10])).nullReason).toBe('zero_or_negative_denominator');
});
