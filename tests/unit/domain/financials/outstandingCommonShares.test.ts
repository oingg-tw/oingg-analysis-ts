import { expect, test } from 'vitest';
import { computeOutstandingCommonShares } from '@/domain/financials/outstandingCommonShares';

const base = { issuedShares: 16_202_510_128n, parValue: 10, preferredCapitalThousands: null, treasuryShares: null, knownPreferredIssuer: false };

test('扣特別股（股本千元 ×1000 ÷ 面額）與庫藏股', () => {
  // 形狀照 2882 國泰金 113 年底：特別股股本 15,333,000 千元 → 1,533,300,000 股
  expect(computeOutstandingCommonShares({ ...base, preferredCapitalThousands: 15_333_000n, knownPreferredIssuer: true }))
    .toEqual({ outstandingCommonShares: 14_669_210_128n, preferredShares: 1_533_300_000n, treasuryShares: 0n });
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
