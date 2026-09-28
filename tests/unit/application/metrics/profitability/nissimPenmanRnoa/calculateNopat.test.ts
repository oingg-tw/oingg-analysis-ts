import { expect, test } from 'vitest';
import { calculateNopat } from '@/application/metrics/profitability/nissimPenmanRnoa/computeNissimPenmanRnoa';

// 2026-09-28 RNOA v3：虧損季稅率當 0、NOPAT = 營業利益（之前回 null，近四季含一季虧損就整筆 null 並誤標 insufficient_history）。
test('虧損季：稅率當 0，NOPAT = 營業利益（可為負）', () => {
  expect(calculateNopat({ operatingIncome: -500n, profitBeforeTax: -300n, incomeTaxExpense: 20n })).toBe(-500n);
});

test('獲利季：NOPAT = 營業利益 ×（1 − 有效稅率）；缺欄位回 null', () => {
  expect(calculateNopat({ operatingIncome: 1000n, profitBeforeTax: 1000n, incomeTaxExpense: 200n })).toBe(800n);
  expect(calculateNopat({ operatingIncome: 1000n, profitBeforeTax: null, incomeTaxExpense: 200n })).toBeNull();
});
