import { describe, expect, test } from 'vitest';
import { calculateRoeWeighted5y } from '@/domain/metrics/profitability/roeWeighted5y/calculateRoeWeighted5y';

// 2026-10-07 五年權益加權 ROE：五年淨利合計 ÷ 五年平均權益合計。釘住「等於各年 ROE 以平均權益加權」跟三種 null。
describe('calculateRoeWeighted5y', () => {
  test('等於五年淨利合計 ÷ 五年平均權益合計（不是各年 ROE 的簡單平均）', () => {
    // 年底權益 100,100,100,100,100,1000：前四年平均權益 100、最後一年 550；淨利每年 10 → 各年 ROE 10%,10%,10%,10%,1.82%。
    // 簡單平均 = 8.36%；權益加權 = 50 / (400 + 550) = 5.26%。
    const r = calculateRoeWeighted5y([10n, 10n, 10n, 10n, 10n], [100n, 100n, 100n, 100n, 100n, 1000n]);
    expect(r).toEqual({ value: 5.26, nullReason: null });
  });

  test('權益不變時等於各年 ROE 的平均', () => {
    expect(calculateRoeWeighted5y([5n, 10n, 15n, 20n, 25n], [100n, 100n, 100n, 100n, 100n, 100n]).value).toBe(15);
  });

  test('任一年淨利或年底權益缺漏 → insufficient_history', () => {
    expect(calculateRoeWeighted5y([10n, null, 10n, 10n, 10n], [100n, 100n, 100n, 100n, 100n, 100n]).nullReason).toBe('insufficient_history');
    expect(calculateRoeWeighted5y([10n, 10n, 10n, 10n, 10n], [null, 100n, 100n, 100n, 100n, 100n]).nullReason).toBe('insufficient_history');
    expect(calculateRoeWeighted5y([10n, 10n, 10n, 10n], [100n, 100n, 100n, 100n, 100n]).nullReason).toBe('insufficient_history');
  });

  test('平均權益合計 ≤ 0 → zero_or_negative_denominator；虧損年度照算（可為負）', () => {
    expect(calculateRoeWeighted5y([10n, 10n, 10n, 10n, 10n], [-100n, -100n, -100n, -100n, -100n, -100n])).toEqual({ value: null, nullReason: 'zero_or_negative_denominator' });
    expect(calculateRoeWeighted5y([-30n, 10n, 10n, 10n, 10n], [100n, 100n, 100n, 100n, 100n, 100n]).value).toBe(2);
  });
});
