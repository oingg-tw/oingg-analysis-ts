import { expect, test } from 'vitest';
import { pickPaidInSharesRow } from '@/domain/financials/paidInSharesRow';

// 預設：金額換算的股數等於股數（兩格一致）、沒有核定股數資料
const row = (shares: number, misaligned = false, amount: number | null = shares, authorized: number | null = null) => ({
  paid_in_shares: BigInt(shares),
  misaligned,
  amount_shares: amount === null ? null : BigInt(amount),
  authorized_shares: authorized === null ? null : BigInt(authorized),
});
const shares = (rows: ReturnType<typeof row>[]) => pickPaidInSharesRow(rows)?.shares ?? null;

test('最新一筆一致 → 用它', () => {
  expect(shares([row(100), row(90)])).toBe(100n);
});

test('最新一筆錯位、股數跟前一筆差 10 倍 → 跳過，用前一筆', () => {
  expect(shares([row(1000, true, 100), row(100)])).toBe(100n);
});

test('最新一筆錯位、股數跟前一筆連貫（±50% 內）→ 股數照用', () => {
  expect(shares([row(95, true, 950), row(97)])).toBe(95n);
});

test('錯位列沒有一致的前一筆 → null（不猜）', () => {
  expect(shares([row(1000, true, 100)])).toBeNull();
  expect(shares([row(1000, true, 100), row(1001, true, 100)])).toBeNull();
});

test('核定股數判準：只有股數合法 → 用股數（5512 2024-10：金額換算超過核定 7.6 倍），不需要前一筆', () => {
  expect(shares([row(766_312_494, true, 7_663_124_940, 1_010_000_000)])).toBe(766_312_494n);
});

test('核定股數判準：只有金額合法 → 用實收資本 ÷ 面額（股數格印錯），也涵蓋不是 10^k 的其他比例', () => {
  expect(shares([row(3_521_650_840, false, 352_165_084, 400_000_000), row(300_000_000)])).toBe(352_165_084n);
});

test('兩格差在 1% 內（四捨五入）或兩邊都合法 → 退回原本規則', () => {
  expect(shares([row(1_005, false, 1_000, 500)])).toBe(1_005n);
  expect(shares([row(1000, true, 100, 5000), row(100)])).toBe(100n);
});
