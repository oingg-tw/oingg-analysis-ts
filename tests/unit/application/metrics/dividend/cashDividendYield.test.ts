import { expect, test } from 'vitest';
import { cashDividendYieldOf } from '@/application/metrics/dividend/cashDividendYield/computeCashDividendYield';

// 2026-10-08 股東總回饋率的股利那一段：千元 ×1000 ÷ 市值（元）× 100，四捨五入 2 位；近四季不齊／市值缺漏的 nullReason 跟 shareholderYield 同一套。
test('|股利合計|（千元）× 1000 ÷ 市值 × 100', () => {
  expect(cashDividendYieldOf({ ttmComplete: true, dividendsAbs: 85_000n, marketCap: { marketCap: 10_000_000_000 } })).toEqual({ value: 0.85, nullReason: null });
});

test('近四季不齊 → insufficient_history；市值缺漏或 0 → missing_input', () => {
  expect(cashDividendYieldOf({ ttmComplete: false, dividendsAbs: 1n, marketCap: { marketCap: 1 } }).nullReason).toBe('insufficient_history');
  expect(cashDividendYieldOf({ ttmComplete: true, dividendsAbs: 1n, marketCap: null }).nullReason).toBe('missing_input');
  expect(cashDividendYieldOf({ ttmComplete: true, dividendsAbs: 1n, marketCap: { marketCap: 0 } }).nullReason).toBe('missing_input');
});
