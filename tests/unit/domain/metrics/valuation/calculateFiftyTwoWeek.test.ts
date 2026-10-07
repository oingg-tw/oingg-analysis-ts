import { expect, test } from 'vitest';
import { adjustForBasisChanges, calculateFiftyTwoWeek, dedupeByTradeDate, type DailyClose } from '@/domain/metrics/valuation/fiftyTwoWeek/calculateFiftyTwoWeek';

// 2026-10-07 52 週三支：窗口起點基準、高低點只看窗口內、股數基準還原、轉板同日去重、上市未滿一年。
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const c = (date: string, close: number): DailyClose => ({ tradeDate: d(date), close });
const WINDOW_START = d('2025-10-07');

test('報酬 = 最新 ÷ 窗口起點當天或之前最後一筆 − 1；高低點只看窗口內（起點那筆不算）', () => {
  const closes = [c('2025-10-01', 50), c('2025-10-06', 100), c('2025-12-01', 150), c('2026-05-01', 80), c('2026-10-07', 120)];
  expect(calculateFiftyTwoWeek(closes, WINDOW_START)).toEqual({
    priceReturn: { value: 20, nullReason: null },
    distanceFromHigh: { value: -20, nullReason: null },
    distanceFromLow: { value: 50, nullReason: null },
  });
});

test('面額 10→1（股數 ×10）之前的收盤 ÷ 10，不會出現假的 −90%', () => {
  const raw = [c('2025-10-06', 500), c('2026-03-01', 600), c('2026-03-02', 60), c('2026-10-07', 55)];
  const adjusted = adjustForBasisChanges(raw, [{ date: d('2026-03-02'), multiplier: 10 }]);
  expect(adjusted.map((x) => x.close)).toEqual([50, 60, 60, 55]);
  expect(calculateFiftyTwoWeek(adjusted, WINDOW_START).priceReturn.value).toBe(10);
});

test('轉板同一天兩列只留先出現那列（上市在前＝上市優先）', () => {
  expect(dedupeByTradeDate([c('2026-01-02', 10), c('2026-01-02', 11), c('2026-01-03', 12)]).map((x) => x.close)).toEqual([10, 12]);
});

test('序列開始得比一年前晚（上市未滿一年）→ 三支都 insufficient_history', () => {
  const r = calculateFiftyTwoWeek([c('2026-01-02', 10), c('2026-10-07', 12)], WINDOW_START);
  expect([r.priceReturn.nullReason, r.distanceFromHigh.nullReason, r.distanceFromLow.nullReason]).toEqual(['insufficient_history', 'insufficient_history', 'insufficient_history']);
});
