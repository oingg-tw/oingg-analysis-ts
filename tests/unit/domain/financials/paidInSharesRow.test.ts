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

test('兩格都錯、方向相反（ratio 100）→ 用幾何中位：6546 2025-03 跟前一筆連貫', () => {
  expect(shares([row(668_484_490, true, 6_684_845, 100_000_000), row(66_836_846, false, 66_836_846, 100_000_000)])).toBe(66_848_449n);
});

test('8171：2025 四列都是 ratio 100，增資後幾何中位 1.12 億跟 2024-08 的 7,746 萬連貫（±50%），不再沿用舊股數', () => {
  expect(shares([row(1_128_533_260, true, 11_285_333, 150_000_000), row(77_464_282, false, 77_464_282, 150_000_000)])).toBe(112_853_326n);
});

test('沒有前一筆一致列：ratio 100 用幾何中位（3131 2026-06）；只有金額合法的 10^1 錯位列仍不收', () => {
  expect(shares([row(292_589_270, true, 2_925_893, 50_000_000)])).toBe(29_258_927n);
  expect(shares([row(1000, true, 100, 500)])).toBeNull();
});
