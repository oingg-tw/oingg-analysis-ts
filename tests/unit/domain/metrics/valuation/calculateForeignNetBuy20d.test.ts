import { expect, test } from 'vitest';
import { calculateForeignNetBuy20d } from '@/domain/metrics/valuation/foreignNetBuy20d/calculateForeignNetBuy20d';

// 2026-10-07 近 20 日外資買賣超 ÷ 流通股數 × 100：4 位小數、交易日不足 20 天與股數缺漏的 nullReason。
test('買賣超合計 ÷ 流通股數 × 100，留 4 位小數（可為負）', () => {
  expect(calculateForeignNetBuy20d(50_000_000n, 20, 25_900_000_000)).toEqual({ value: 0.1931, nullReason: null });
  expect(calculateForeignNetBuy20d(-1_000n, 20, 1_000_000).value).toBe(-0.1);
});

test('交易日不足 20 天 → insufficient_history；股數 null → missing_input；股數 ≤ 0 → zero_or_negative_denominator', () => {
  expect(calculateForeignNetBuy20d(1n, 19, 1_000).nullReason).toBe('insufficient_history');
  expect(calculateForeignNetBuy20d(1n, 20, null).nullReason).toBe('missing_input');
  expect(calculateForeignNetBuy20d(1n, 20, 0).nullReason).toBe('zero_or_negative_denominator');
});
