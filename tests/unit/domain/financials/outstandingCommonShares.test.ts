import { expect, test } from 'vitest';
import { computeOutstandingCommonShares, effectivePreferredDividends, preferredClaimThousands, toCommonEarnings, toCommonEquity } from '@/domain/financials/outstandingCommonShares';

const base = { issuedShares: 16_202_510_128n, parValue: 10, preferredCapitalThousands: null, treasuryShares: null, knownPreferredIssuer: false };

test('扣特別股（股本千元 ×1000 ÷ 面額）與庫藏股', () => {
  // 形狀照 2882 國泰金 113 年底：特別股股本 15,333,000 千元 → 1,533,300,000 股
  expect(computeOutstandingCommonShares({ ...base, preferredCapitalThousands: 15_333_000n, knownPreferredIssuer: true }))
    .toEqual({ outstandingCommonShares: 14_669_210_128n, preferredShares: 1_533_300_000n, treasuryShares: 0n, preferredCapitalThousands: 15_333_000n });
  expect(computeOutstandingCommonShares({ ...base, issuedShares: 3_723_261_811n, treasuryShares: 698_751_601n })?.outstandingCommonShares).toBe(3_024_510_210n);
});

test('沒有特別股、沒有庫藏股資料 → 等於已發行股數', () => {
  expect(computeOutstandingCommonShares(base)?.outstandingCommonShares).toBe(16_202_510_128n);
});

test('有特別股卻查不到特別股股本 → null（分母定義待補，不算少扣特別股的值）', () => {
  expect(computeOutstandingCommonShares({ ...base, knownPreferredIssuer: true })).toBeNull();
  expect(computeOutstandingCommonShares({ ...base, knownPreferredIssuer: true, preferredCapitalThousands: 0n })).toBeNull();
});

test('面額缺漏時用 10', () => {
  expect(computeOutstandingCommonShares({ ...base, parValue: null, preferredCapitalThousands: 1_000n })?.preferredShares).toBe(100_000n);
});

test('EPS 分子扣特別股股利：單季扣近四季的 1/4、近四季扣全額；淨利缺值維持 null', () => {
  expect(toCommonEarnings(110_269_745n, 3_404_403n, 'TTM')).toBe(106_865_342n);
  expect(toCommonEarnings(30_000_000n, 4_000_000n, 'Q')).toBe(29_000_000n);
  expect(toCommonEarnings(null, 4_000_000n, 'Q')).toBeNull();
});

test('每股淨值分子扣特別股股本', () => {
  expect(toCommonEquity(1_000_000n, 15_333n)).toBe(984_667n);
  expect(toCommonEquity(null, 15_333n)).toBeNull();
});

test('沒有權益類特別股股本就不扣特別股股利（5213 把普通股股利申報在特別股欄）', () => {
  expect(effectivePreferredDividends(848_626n, 0n)).toBe(0n);
  expect(effectivePreferredDividends(561_661n, 15_821_424n)).toBe(561_661n);
});

// 2026-09-27 特別股扣發行價（preferredClaimThousands）

test('2838：單一代號 2838A 發行價 50，股本 20 億（2 億股）→ 扣 100 億', () => {
  expect(preferredClaimThousands(2_000_000n, [{ participatingShares: 200_000_000, issuePrice: 50 }])).toBe(10_000_000n);
});

test('2897：A 已贖回（最後配息 2025）、只有 B 2.5 億股對上股本 25 億 → 只算 B × 12', () => {
  expect(preferredClaimThousands(2_500_000n, [{ participatingShares: 227_600_000, issuePrice: 10 }, { participatingShares: 250_000_000, issuePrice: 12 }])).toBe(3_000_000n);
});

test('2887：I 股不在權益特別股股本裡，E+F+G+H+Z1 對上 139.47 億', () => {
  const series = [
    { participatingShares: 499_200_000, issuePrice: 50 }, { participatingShares: 299_000_000, issuePrice: 50 },
    { participatingShares: 75_000_000, issuePrice: 45 }, { participatingShares: 219_700_000, issuePrice: 45 },
    { participatingShares: 3_096_400_000, issuePrice: 10 }, { participatingShares: 300_000_000, issuePrice: 17.65 },
  ];
  expect(preferredClaimThousands(13_947_000n, series)).toBe(BigInt(Math.round((499_200_000 * 50 + 299_000_000 * 50 + 75_000_000 * 45 + 219_700_000 * 45 + 300_000_000 * 17.65) / 1000)));
});

test('對不上又有多種發行價 → 退回面額；沒有特別股 → 0', () => {
  expect(preferredClaimThousands(1_000_000n, [{ participatingShares: 30_000_000, issuePrice: 50 }, { participatingShares: 40_000_000, issuePrice: 40 }])).toBe(1_000_000n);
  expect(preferredClaimThousands(0n, [{ participatingShares: 1, issuePrice: 50 }])).toBe(0n);
});

test('6958：沒有任何分派紀錄、特別股權利表只有一種發行價 25 → 用它；有多種發行價 → 面額', () => {
  expect(preferredClaimThousands(400_000n, [], [25])).toBe(1_000_000n);
  expect(preferredClaimThousands(400_000n, [], [25, 50])).toBe(400_000n);
});
