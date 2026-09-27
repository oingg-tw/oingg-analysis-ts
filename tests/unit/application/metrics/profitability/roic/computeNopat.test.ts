import { expect, test } from 'vitest';
import { computeNopat } from '@/application/metrics/profitability/roic/computeRoic';

// 2026-09-28 roic v3：虧損季稅率當 0、NOPAT = EBIT（之前回 null，讓近四季含一季虧損的 TTM 整筆 null 並誤標 insufficient_history）。
test('虧損季：稅率當 0，NOPAT = EBIT（可為負）', () => {
  // 1301 台塑 111Q4（千元）
  expect(computeNopat({ profitBeforeTax: -7345868n, financeCosts: 386745n, incomeTaxExpense: 47370n })).toBe(-6959123n);
});

test('獲利季：NOPAT = EBIT ×（1 − 有效稅率），有效稅率夾在 0~1', () => {
  expect(computeNopat({ profitBeforeTax: 1000n, financeCosts: 100n, incomeTaxExpense: 200n })).toBe(880n);
  expect(computeNopat({ profitBeforeTax: 1000n, financeCosts: 100n, incomeTaxExpense: -50n })).toBe(1100n);
});

test('缺欄位仍回 null', () => {
  expect(computeNopat({ profitBeforeTax: 1000n, financeCosts: null, incomeTaxExpense: 200n })).toBeNull();
});
