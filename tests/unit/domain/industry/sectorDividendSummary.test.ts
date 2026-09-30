import { describe, expect, test } from 'vitest';
import { summarizeSectorDividends } from '@/domain/industry/sectorDividendSummary';

const row = (sectorCode: string, dividendYield: number | null, dividendGrowthRate3y: number | null) => ({ sectorCode, sectorName: `${sectorCode}業`, dividendYield, dividendGrowthRate3y });

describe('summarizeSectorDividends', () => {
  test('按類股分組；null 不算、0 照呼叫端給的算；偶數個取中間兩個平均；依代碼排序', () => {
    const result = summarizeSectorDividends([row('24', 0, null), row('01', 4, 10), row('24', 3, 5), row('24', 6, 200), row('24', null, 1)]);
    expect(result).toEqual([
      { sectorCode: '01', sectorName: '01業', companyCount: 1, dividendYield: { count: 1, mean: 4, median: 4 }, dividendGrowthRate3y: { count: 1, mean: 10, median: 10 } },
      // 成長率 [1,5,200]：平均被 200 拉到 68.67，中位數 5——兩個都給的理由
      { sectorCode: '24', sectorName: '24業', companyCount: 4, dividendYield: { count: 3, mean: 3, median: 3 }, dividendGrowthRate3y: { count: 3, mean: 68.67, median: 5 } },
    ]);
  });

  test('整個類股某一軸都沒值：count 0、mean/median null（不是 0）', () => {
    expect(summarizeSectorDividends([row('30', null, null)])[0]!.dividendGrowthRate3y).toEqual({ count: 0, mean: null, median: null });
  });

  test('偶數個取中間兩個平均', () => {
    expect(summarizeSectorDividends([row('01', 1, null), row('01', 2, null), row('01', 10, null), row('01', 20, null)])[0]!.dividendYield.median).toBe(6);
  });
});
