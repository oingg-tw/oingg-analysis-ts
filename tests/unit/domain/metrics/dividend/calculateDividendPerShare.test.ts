import { expect, test } from 'vitest';
import { calculateDividendPerShare } from '@/domain/metrics/dividend/dividendPerShare/calculateDividendPerShare';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ev = (ex: string, earnings: number | null, reserve: number | null = null) => ({
  exDividendDate: day(ex), cashDividendFromEarnings: earnings, cashDividendFromLegalReserveAndCapitalSurplus: reserve,
});
const END = day('2026-06-30');

test('近一年除息的普通股每股現金股利加總（盈餘 + 公積發放）', () => {
  expect(calculateDividendPerShare([ev('2025-09-16', 5), ev('2025-12-11', 5), ev('2026-03-17', 6), ev('2026-06-11', 6)], END))
    .toEqual({ value: 22, nullReason: null });
  expect(calculateDividendPerShare([ev('2025-08-01', 0, 0.9)], END)).toEqual({ value: 0.9, nullReason: null });
});

test('窗口起點不含、終點含（季配公司剛好相隔一年那次不重複算）', () => {
  expect(calculateDividendPerShare([ev('2025-06-30', 5), ev('2026-06-30', 6)], END).value).toBe(6);
});

test('有公告資料但近一年沒除息 → 0（那一年沒配）', () => {
  expect(calculateDividendPerShare([ev('2023-07-01', 3)], END)).toEqual({ value: 0, nullReason: null });
});

test('公司一筆公告都沒有 → null missing_input（分不出從未配息或未收錄）', () => {
  expect(calculateDividendPerShare([], END)).toEqual({ value: null, nullReason: 'missing_input' });
});

test('窗口起點早於資料起點（2019-10）→ insufficient_history', () => {
  expect(calculateDividendPerShare([ev('2019-08-01', 3)], day('2020-06-30'))).toEqual({ value: null, nullReason: 'insufficient_history' });
  expect(calculateDividendPerShare([ev('2020-08-01', 3)], day('2020-09-30')).nullReason).toBe(null);
});
