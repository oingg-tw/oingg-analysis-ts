import { expect, test } from 'vitest';
import { pickPaidInSharesRow, reconcileWithBalanceSheet } from '@/domain/financials/paidInSharesRow';

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

// 規則 A：資產負債表股本（千元）當裁判
const pick = (shares: number, ym: number, parValue: number, paidInCapital: number) => ({ shares: BigInt(shares), ym, parValue, paidInCapital: BigInt(paidInCapital) });
const bs = (quarterEndYm: number, capitalThousands: number) => ({ quarterEndYm, capitalThousands: BigInt(capitalThousands) });

test('2237 2026-03 實收／核定對調：整列跟 115Q1 資產負債表差 64% → 資產負債表股本 ÷ 面額', () => {
  expect(reconcileWithBalanceSheet(pick(200_000_000, 202603, 10, 2_000_000_000), bs(202603, 1_217_729))).toBe(121_772_900n);
});

test('4702 漏記減資：股本歷史 2.25 億股、資產負債表 723,332 千元 → 7,233 萬股', () => {
  expect(reconcileWithBalanceSheet(pick(225_000_000, 202001, 10, 2_250_000_000), bs(202512, 723_332))).toBe(72_333_200n);
});

test('7851／6564 面額欄寫錯但同列實收資本跟資產負債表一致 → 不觸發（比金額不比股數）', () => {
  expect(reconcileWithBalanceSheet(pick(67_691_145, 202508, 0.5, 338_455_725), bs(202606, 338_456))).toBe(67_691_145n);
  expect(reconcileWithBalanceSheet(pick(72_050_000, 202406, 32, 720_500_000), bs(202606, 720_500))).toBe(72_050_000n);
});

test('差距 20% 以內（增資登記時間差）照用股本歷史', () => {
  expect(reconcileWithBalanceSheet(pick(115_000_000, 202509, 10, 1_150_000_000), bs(202509, 1_000_000))).toBe(115_000_000n);
});

test('2237 2026-09 兩格方向相反（資本格 ÷10）：幾何中位 × 面額跟資產負債表一致 → 不觸發', () => {
  expect(reconcileWithBalanceSheet(pick(128_885_901, 202609, 10, 128_885_901), bs(202609, 1_288_859))).toBe(128_885_901n);
});

test('股本列在資產負債表季末之後才生效 → 資產負債表還沒反映，不裁判；沒有資產負債表也不動', () => {
  expect(reconcileWithBalanceSheet(pick(128_885_901, 202609, 10, 1_288_859_010), bs(202606, 1_217_429))).toBe(128_885_901n);
  expect(reconcileWithBalanceSheet(pick(200_000_000, 202603, 10, 2_000_000_000), null)).toBe(200_000_000n);
});

test('2237：2026-03 實收／核定對調（實收 > 核定）不當連貫性參考 → 2026-09 幾何中位跟 2025-12 連貫', () => {
  expect(
    shares([row(1_288_859_010, true, 12_888_590, 200_000_000), row(200_000_000, false, 200_000_000, 121_772_901), row(121_792_901, false, 121_792_901, 200_000_000)])
  ).toBe(128_885_901n);
});
