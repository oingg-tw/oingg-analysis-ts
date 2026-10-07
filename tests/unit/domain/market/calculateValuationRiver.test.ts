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
  expect(r.bandMultiples).toEqual([10, 10, 10, 10, 10, 10]);
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

test('第 5～95 百分位截尾後等分五條：六條線等距；目前百分位', () => {
  expect(percentileOf([1, 2, 3, 4, 5], 25)).toBe(2);
  expect(percentileOf([1, 2, 3, 4], 50)).toBe(2.5);
  const closes = [8, 10, 12, 14, 16].map((close, i) => ({ tradeDate: d(`2026-01-0${i + 1}`), close }));
  const r = calculateValuationRiver(closes, [{ effectiveFrom: d('2026-01-01'), base: 1 }]);
  // P5 = 8.4、P95 = 15.6，等分五條每條 1.44
  expect(r.bandMultiples).toEqual([8.4, 9.84, 11.28, 12.72, 14.16, 15.6]);
  expect(r.current).toMatchObject({ ratio: 16, percentile: 100 });
  expect(r.ratioRange).toEqual({ min: 8, max: 16 });
});

test('單一極端日子不會撐開河道（最低～最高等分會被 1000 倍拉到每條 200 倍寬）', () => {
  const ratios = [...Array.from({ length: 20 }, (_, i) => i + 1), 1000];
  const closes = ratios.map((close, i) => ({ tradeDate: new Date(Date.UTC(2026, 0, i + 1)), close }));
  const r = calculateValuationRiver(closes, [{ effectiveFrom: d('2026-01-01'), base: 1 }]);
  expect(r.bandMultiples![0]).toBe(2);
  expect(r.bandMultiples!.at(-1)).toBe(20);
  expect(r.ratioRange).toEqual({ min: 1, max: 1000 });
});
