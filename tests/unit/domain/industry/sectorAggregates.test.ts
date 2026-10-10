import { expect, test } from 'vitest';
import { summarizeQuartiles, summarizeSectorMonthlyRevenue, summarizeSectorPeriods } from '@/domain/industry/sectorAggregates';

// 2026-10-09 類股三支端點的彙總規則：四分位跟 percentile_cont 同定義、逐期不混期、月營收同一批公司口徑。
test('四分位用線性內插（同 percentile_cont），偶數家中位數取中間兩家平均', () => {
  expect(summarizeQuartiles([4, 1, 3, 2])).toEqual({ count: 4, median: 2.5, q1: 1.75, q3: 3.25 });
  expect(summarizeQuartiles([7])).toEqual({ count: 1, median: 7, q1: 7, q3: 7 });
  expect(summarizeQuartiles([])).toEqual({ count: 0, median: null, q1: null, q3: null });
});

test('逐期分組由舊到新；全部 null 的期別帶最多公司的 nullReason，有值的期別 nullReason 為 null', () => {
  const result = summarizeSectorPeriods([
    { fiscalYear: 2026, fiscalQuarter: 2, value: 10, nullReason: null },
    { fiscalYear: 2026, fiscalQuarter: 2, value: null, nullReason: 'missing_input' },
    { fiscalYear: 2025, fiscalQuarter: 4, value: null, nullReason: 'not_applicable_industry' },
    { fiscalYear: 2025, fiscalQuarter: 4, value: null, nullReason: 'not_applicable_industry' },
    { fiscalYear: 2025, fiscalQuarter: 4, value: null, nullReason: 'missing_input' },
  ]);
  expect(result).toEqual([
    { fiscalYear: 2025, fiscalQuarter: 4, count: 0, median: null, q1: null, q3: null, nullReason: 'not_applicable_industry' },
    { fiscalYear: 2026, fiscalQuarter: 2, count: 1, median: 10, q1: 10, q3: 10, nullReason: null },
  ]);
});

test('月營收只加當月有值、去年同月 > 0 的同一批公司（新上市那家不進分子也不進分母）', () => {
  const result = summarizeSectorMonthlyRevenue([
    { symbol: 'A', yearMonth: '2026-08', currentMonthRevenue: 1200n, lastYearSameMonthRevenue: 1000n },
    { symbol: 'B', yearMonth: '2026-08', currentMonthRevenue: 300n, lastYearSameMonthRevenue: 200n },
    { symbol: 'NEW', yearMonth: '2026-08', currentMonthRevenue: 5000n, lastYearSameMonthRevenue: 0n }, // 去年還沒營收：不可比
    { symbol: 'A', yearMonth: '2026-07', currentMonthRevenue: 900n, lastYearSameMonthRevenue: 1000n },
    { symbol: 'B', yearMonth: '2026-07', currentMonthRevenue: null, lastYearSameMonthRevenue: 200n },
  ]);
  expect(result).toEqual([
    { yearMonth: '2026-07', currentMonthRevenue: '900', lastYearSameMonthRevenue: '1000', yoyChangePct: -10, companyCount: 1 },
    { yearMonth: '2026-08', currentMonthRevenue: '1500', lastYearSameMonthRevenue: '1200', yoyChangePct: 25, companyCount: 2 },
  ]);
});
