import { describe, it, expect } from 'vitest';
import { calculateSus, SUS_WINDOW_MONTHS } from '@/domain/metrics/growth/sus/calculateSus';

// 窗口是 21 個月（t−20 … t），最後一筆是目標月。
const series = (fill: (i: number) => number | null, len = SUS_WINDOW_MONTHS): (number | null)[] => Array.from({ length: len }, (_, i) => fill(i));

describe('calculateSus', () => {
  it('窗口長度不對或有缺月 → insufficient_history', () => {
    expect(calculateSus(series(() => 100, 20))).toEqual({ value: null, nullReason: 'insufficient_history' });
    expect(calculateSus(series((i) => (i === 3 ? null : 100)))).toEqual({ value: null, nullReason: 'insufficient_history' });
  });

  it('營收完全不變 → 8 個季節差分全是 0，標準差為 0 → zero_or_negative_denominator', () => {
    expect(calculateSus(series(() => 100))).toEqual({ value: null, nullReason: 'zero_or_negative_denominator' });
  });

  it('完美等差成長 → 季節差分全部相同、標準差仍為 0（不是 bug，是沒有尺規可量意外）', () => {
    // 每月 +10，任兩個相隔 12 月的差都是 120，所以 8 個差分完全一樣。
    expect(calculateSus(series((i) => 100 + i * 10)).nullReason).toBe('zero_or_negative_denominator');
  });

  it('完全符合季節性隨機漫步的預期 → SUS 為 0', () => {
    // 前 20 個月：跟去年同月固定差 120（drift=120、σ=0 會被擋），所以讓差分有變異但目標月正好落在期望值。
    const base = series((i) => 100 + i * 10) as number[];
    // 手動製造有變異的差分：把 t−1 的值抬高，使 8 個差分不全等。
    base[19] = base[19]! + 50;
    const drifted = [...base];
    // 目標月 = R_{t−12} + drift，drift = 8 個差分的平均。
    const diffs: number[] = [];
    for (let j = 1; j <= 8; j++) diffs.push(drifted[20 - j]! - drifted[20 - j - 12]!);
    const drift = diffs.reduce((a, b) => a + b, 0) / 8;
    drifted[20] = drifted[8]! + drift;

    const { value, nullReason } = calculateSus(drifted);
    expect(nullReason).toBeNull();
    expect(value).toBeCloseTo(0, 10);
  });

  it('正向意外：目標月高於期望值 → SUS 為正，且等於超出量除以差分標準差', () => {
    const base = series((i) => 100 + i * 10) as number[];
    base[19] = base[19]! + 50;
    const diffs: number[] = [];
    for (let j = 1; j <= 8; j++) diffs.push(base[20 - j]! - base[20 - j - 12]!);
    const drift = diffs.reduce((a, b) => a + b, 0) / 8;
    const sigma = Math.sqrt(diffs.reduce((s, d) => s + (d - drift) ** 2, 0) / 7);
    const expected = base[8]! + drift;

    base[20] = expected + 2 * sigma; // 剛好高出兩個標準差
    expect(calculateSus(base).value).toBeCloseTo(2, 10);

    base[20] = expected - sigma; // 低於期望一個標準差
    expect(calculateSus(base).value).toBeCloseTo(-1, 10);
  });

  it('尺規是公司自己的波動：同樣的絕對超出量，波動大的公司 SUS 比較小', () => {
    const makeSeries = (jitter: number): number[] => {
      const s = series((i) => 100 + i * 10) as number[];
      for (let i = 13; i <= 19; i += 2) s[i] = s[i]! + jitter; // 只動 t−1..t−7 這段，製造差分變異
      return s;
    };
    const calm = makeSeries(20);
    const volatile = makeSeries(200);
    const surplus = 300;
    for (const s of [calm, volatile]) {
      const diffs: number[] = [];
      for (let j = 1; j <= 8; j++) diffs.push(s[20 - j]! - s[20 - j - 12]!);
      const drift = diffs.reduce((a, b) => a + b, 0) / 8;
      s[20] = s[8]! + drift + surplus;
    }
    const calmSus = calculateSus(calm).value!;
    const volatileSus = calculateSus(volatile).value!;
    expect(calmSus).toBeGreaterThan(volatileSus);
  });
});
