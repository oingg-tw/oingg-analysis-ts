import { expect, test } from 'vitest';
import { baseOn, calculateValuationRiver, percentileOf } from '@/domain/market/calculateValuationRiver';
import { adjustForBasisChanges } from '@/domain/metrics/valuation/fiftyTwoWeek/calculateFiftyTwoWeek';

// 2026-10-08 河流圖：公告日才換基準、分割前後比值連續、基準 ≤ 0 不進百分位、百分位線性內插。
const d = (s: string) => new Date(`${s}T00:00:00Z`);

test('基準在公告日（effectiveFrom）才換，季底到公告日之間沿用上一份', () => {
  const bases = [
    { effectiveFrom: d('2026-05-14'), base: 10 }, // 115Q1，季底 03-31、05-14 公告
    { effectiveFrom: d('2026-08-13'), base: 12 }, // 115Q2，季底 06-30、08-13 公告
  ];
  expect(baseOn(bases, d('2026-07-15'))).toBe(10); // 季底後、公告前：還是 Q1
  expect(baseOn(bases, d('2026-08-13'))).toBe(12);
  expect(baseOn(bases, d('2026-05-13'))).toBeNull(); // 第一份公告前沒有基準
});

test('面額 10→1：股價換算到今天基準後，比值跨事件連續（基準本來就是今天基準）', () => {
  const raw = [
    { tradeDate: d('2026-08-07'), close: 700 },
    { tradeDate: d('2026-08-10'), close: 70 },
  ];
  const closes = adjustForBasisChanges(raw, [{ date: d('2026-08-10'), multiplier: 10 }]);
  const r = calculateValuationRiver(closes, [{ effectiveFrom: d('2026-01-01'), base: 7 }]);
  expect(r.multiples?.map((m) => m.multiple)).toEqual([10, 10, 10, 10, 10]);
});

test('基準 ≤ 0（近四季虧損）的日子不進百分位；目前那天虧損時 ratio 與 percentile 為 null', () => {
  const closes = [10, 20, 30, 40, 50].map((close, i) => ({ tradeDate: d(`2026-01-0${i + 1}`), close }));
  const r = calculateValuationRiver(closes, [
    { effectiveFrom: d('2026-01-01'), base: 10 },
    { effectiveFrom: d('2026-01-04'), base: -1 },
  ]);
  expect(r.sampleDays).toBe(3);
  expect(r.current).toMatchObject({ price: 50, base: -1, ratio: null, percentile: null });
});

test('百分位線性內插（PERCENTILE.INC）與目前百分位', () => {
  expect(percentileOf([1, 2, 3, 4, 5], 25)).toBe(2);
  expect(percentileOf([1, 2, 3, 4], 50)).toBe(2.5);
  const closes = [8, 10, 12, 14, 16].map((close, i) => ({ tradeDate: d(`2026-01-0${i + 1}`), close }));
  const r = calculateValuationRiver(closes, [{ effectiveFrom: d('2026-01-01'), base: 1 }]);
  expect(r.multiples).toEqual([
    { percentile: 10, multiple: 8.8 },
    { percentile: 25, multiple: 10 },
    { percentile: 50, multiple: 12 },
    { percentile: 75, multiple: 14 },
    { percentile: 90, multiple: 15.2 },
  ]);
  expect(r.current).toMatchObject({ ratio: 16, percentile: 100 });
  expect(r.ratioRange).toEqual({ min: 8, max: 16 });
});
