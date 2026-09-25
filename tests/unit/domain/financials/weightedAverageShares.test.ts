import { expect, test } from 'vitest';
import { deriveWeightedAverageShares } from '@/domain/financials/weightedAverageShares';

// 算術例：淨利 1,717,880,000 千元、EPS 66.26 → 1,717,880,000,000 ÷ 66.26 ≈ 25,926,350,740 股。
test('反推加權股數：淨利(千元)×1000 ÷ EPS', () => {
  expect(deriveWeightedAverageShares(1_717_880_000n, 66.26)).toBe(25_926_350_740n);
});

test('|EPS| < 0.1 不反推（捨入誤差會超過 5%），剛好 0.1 可以', () => {
  expect(deriveWeightedAverageShares(1_000n, 0.09)).toBeNull();
  expect(deriveWeightedAverageShares(-1_000n, -0.09)).toBeNull();
  expect(deriveWeightedAverageShares(10_000n, 0.1)).toBe(100_000_000n);
});

test('虧損公司照樣反推（淨利與 EPS 同為負）', () => {
  expect(deriveWeightedAverageShares(-50_000n, -0.5)).toBe(100_000_000n);
});

test('缺值或正負號不一致 → null', () => {
  expect(deriveWeightedAverageShares(null, 1)).toBeNull();
  expect(deriveWeightedAverageShares(1_000n, null)).toBeNull();
  expect(deriveWeightedAverageShares(1_000n, -1)).toBeNull();
});
