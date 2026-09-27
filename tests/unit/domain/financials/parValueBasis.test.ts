import { expect, test } from 'vitest';
import { inferUnrecordedParChange, parBasisFactor, shareSplitFactor } from '@/domain/financials/parValueBasis';

const row = (ym: number, parValue: number, shares: number) => ({ ym, parValue, shares: BigInt(shares) });
// 收盤價序列：第一筆預設在變更前（涵蓋到變更之前才判斷得出「未換發」）
const cl = (start: string, ...closes: number[]) => closes.map((close, i) => ({ date: new Date(new Date(start).getTime() + i * 86_400_000), close }));
// 5904：2026-06 面額 10→1，股數 ×10
const p5904 = [row(202409, 10, 104_936_216), row(202509, 10, 106_443_826), row(202606, 1, 1_064_438_260)];

test('5904：季末 06-30 還沒換發（股價沒跳）、每股用報告日新股數 → 股價 ×1/10', () => {
  expect(parBasisFactor(p5904, cl('2026-05-20', 680, 667, 667), new Date('2026-06-30'), new Date('2026-06-30'))).toBeCloseTo(0.1);
});

test('換發後（股價跳成 1/10）→ 不換算', () => {
  expect(parBasisFactor(p5904, cl('2026-05-20', 667, 66.9, 70), new Date('2026-08-20'), new Date('2026-06-30'))).toBeCloseTo(1);
});

test('6949：季末後 2026-07 面額 10→0.5，公告日已換發、每股用季末舊股數 → 股價 ×20 換回舊基準', () => {
  const p6949 = [row(202605, 10, 65_580_050), row(202607, 0.5, 1_311_601_000)];
  expect(parBasisFactor(p6949, cl('2026-06-20', 870, 43.6, 44), new Date('2026-08-14'), new Date('2026-06-30'))).toBeCloseTo(20);
});

test('面額印錯（股數沒跟著變，4157 形狀）→ 不當成變更、不換算；沒有面額變更 → 1', () => {
  expect(parBasisFactor([row(202510, 0.03, 50_000_000), row(202511, 0.003, 50_100_000)], cl('2025-10-01', 10, 10), new Date('2025-12-31'), new Date('2025-12-31'))).toBe(1);
  expect(parBasisFactor([row(202401, 10, 1000)], cl('2025-10-01', 10, 11), new Date('2025-12-31'), new Date('2025-12-31'))).toBe(1);
});

test('股價沒涵蓋到變更之前（7803 股價 2026-05 才有）或距生效超過 180 天 → 視為已換發', () => {
  const p = [row(202201, 5, 4_968_463), row(202202, 0.5, 49_684_630)];
  expect(parBasisFactor(p, cl('2026-05-20', 3, 3.1), new Date('2026-06-30'), new Date('2026-06-30'))).toBe(1);
  expect(parBasisFactor(p, cl('2021-12-01', 30, 30, 31), new Date('2026-06-30'), new Date('2026-06-30'))).toBe(1);
});

test('一年內兩次以上面額變更（5314 形狀）→ 股本歷史不可信，不換算', () => {
  const p = [row(202210, 10, 14_700_000), row(202501, 0.5, 294_000_000), row(202503, 10, 14_700_000), row(202507, 0.5, 292_000_000)];
  expect(parBasisFactor(p, cl('2025-06-01', 70, 71), new Date('2025-09-30'), new Date('2025-09-30'))).toBe(1);
});

test('跨期面額還原：5314 股本歷史 10→0.5→10→0.5 來回跳，連乘後跟兩期實際用到的股數列一致', () => {
  const p = [row(202210, 10, 14_700_000), row(202501, 0.5, 294_000_000), row(202503, 10, 14_700_000), row(202507, 0.5, 292_000_000)];
  // 2024Q3（用 202210 那列 1,470 萬股）→ 2025Q3（用 202507 那列 2.92 億股）：股數 ×20，前期每股 ÷20
  expect(shareSplitFactor(p, new Date('2024-09-30'), new Date('2025-09-30'))).toBe(20);
  // 2024Q1 → 2025Q1（兩期都用 1,470 萬股那一列）：10→0.5→10 抵銷
  expect(shareSplitFactor(p, new Date('2024-03-31'), new Date('2025-03-31'))).toBe(1);
});

test('跨期面額還原：印錯的面額（股數沒跟著變）不算；沒有變更 → 1', () => {
  expect(shareSplitFactor([row(202510, 0.03, 50_000_000), row(202511, 0.003, 50_100_000)], new Date('2025-01-01'), new Date('2025-12-31'))).toBe(1);
  expect(shareSplitFactor([row(202606, 10, 100), row(202607, 1, 1000)], new Date('2025-06-30'), new Date('2026-06-30'))).toBe(1);
});

// 規則 B：股本歷史漏記的面額變更（現況面額不同、實收資本相同、股價跳動）
const cap = (parValue: number, paidInCapital: number) => ({ parValue, paidInCapital: BigInt(paidInCapital) });

test('3093 面額 10→2.5：2022-12-12 股價跳成 1/4 → 補 2022-12 生效、股數＝資本 ÷ 2.5', () => {
  const closes = [{ date: new Date('2022-11-30'), close: 43.8 }, { date: new Date('2022-12-12'), close: 11.12 }, { date: new Date('2022-12-13'), close: 11.2 }];
  expect(inferUnrecordedParChange(cap(10, 362_888_940), cap(2.5, 362_888_940), closes)).toEqual({ ym: 202212, parValue: 2.5, shares: 145_155_576n });
});

test('6564 面額欄寫錯（32 vs 現況 10）：股價沒有跳 3.2 倍 → 不補', () => {
  expect(inferUnrecordedParChange(cap(32, 720_500_000), cap(10, 720_500_000), cl('2024-07-01', 50, 45.5, 50))).toBeNull();
});

test('實收資本也不同（漏的是增減資，不是面額變更）→ 不補；面額相同 → 不補', () => {
  expect(inferUnrecordedParChange(cap(10, 600_024_170), cap(1, 810_024_170), cl('2026-01-08', 100, 11))).toBeNull();
  expect(inferUnrecordedParChange(cap(10, 600_024_170), cap(10, 600_024_170), cl('2026-01-08', 100, 11))).toBeNull();
});

test('補出的列接在股本歷史後面，shareSplitFactor 把跳動前的每股數字換成新股數基準', () => {
  const rows = [row(200908, 10, 36_288_894), { ym: 202212, parValue: 2.5, shares: 145_155_576n }];
  expect(shareSplitFactor(rows, new Date('2021-12-31'), new Date('2022-12-31'))).toBeCloseTo(4);
});
