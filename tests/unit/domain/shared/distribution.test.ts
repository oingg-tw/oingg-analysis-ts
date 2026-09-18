import { describe, expect, test } from 'vitest';
import { buildDistributionBins, clampBucketIndex } from '@/domain/shared/distribution';

describe('clampBucketIndex', () => {
  test('範圍內的 bucket 原樣返回', () => {
    expect(clampBucketIndex(3, 10)).toBe(3);
  });
  test('小於 1（Postgres width_bucket 對低於下界的值回傳 0）夾回 1', () => {
    expect(clampBucketIndex(0, 10)).toBe(1);
  });
  test('大於 bins（Postgres width_bucket 對高於上界的值回傳 bins+1）夾回 bins', () => {
    expect(clampBucketIndex(11, 10)).toBe(10);
  });
});

describe('buildDistributionBins', () => {
  test('等寬切割 [p1, p99]，缺 bucket 補 0', () => {
    const bins = buildDistributionBins(0, 10, 5, new Map([[1, 3], [3, 7]]));
    expect(bins).toEqual([
      { min: 0, max: 2, count: 3 },
      { min: 2, max: 4, count: 0 },
      { min: 4, max: 6, count: 7 },
      { min: 6, max: 8, count: 0 },
      { min: 8, max: 10, count: 0 },
    ]);
  });

  test('p1 等於 p99（樣本太少/全部同值）退化成單一 bucket，不強行切成 bins 份', () => {
    const bins = buildDistributionBins(5, 5, 20, new Map([[1, 42]]));
    expect(bins).toEqual([{ min: 5, max: 5, count: 42 }]);
  });

  test('bins 的 count 加總等於全部送進來的筆數（離群值夾進邊界格，不會憑空消失）', () => {
    const bins = buildDistributionBins(0, 100, 4, new Map([[1, 5], [2, 20], [3, 8], [4, 2]]));
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(35);
  });
});
