import { expect, test } from 'vitest';
import { calculateDistributionsPerFiscalYear } from '@/domain/metrics/dividend/dividendDistributionCount/calculateDividendDistributionCount';

const ev = (ex: string, fy: number | null) => ({ exDividendDate: new Date(ex), rocFiscalYear: fy });

test('年配公司除息日逐年提前（1104：相隔 364 天）→ 1，不是舊定義的 2', () => {
  expect(calculateDistributionsPerFiscalYear([ev('2026-06-24', 114), ev('2025-06-25', 113), ev('2024-07-16', 112)])).toBe(1);
});

test('季配：最新年度只配了 2 次時用前一年的 4', () => {
  const events = [ev('2026-06-11', 115), ev('2026-03-17', 115), ev('2025-12-11', 114), ev('2025-09-16', 114), ev('2025-06-12', 114), ev('2025-03-18', 114)];
  expect(calculateDistributionsPerFiscalYear(events)).toBe(4);
});

test('半年配 → 2；同一天除息重複列只算一次', () => {
  expect(calculateDistributionsPerFiscalYear([ev('2026-07-01', 114), ev('2026-01-05', 114), ev('2026-01-05', 114)])).toBe(2);
});

test('盈餘年度全缺 → null；缺值的列不計', () => {
  expect(calculateDistributionsPerFiscalYear([ev('2026-06-24', null)])).toBeNull();
  expect(calculateDistributionsPerFiscalYear([ev('2026-06-24', null), ev('2025-06-25', 113)])).toBe(1);
});
