import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  simpleMovingAverage,
  exponentialMovingAverageSeries,
  bollingerBands,
  wilderRsi,
  averageTrueRange,
  stochasticKD,
  bias,
  onBalanceVolume,
} from '@/shared/technicalMath';

test('simpleMovingAverage: 資料筆數不足回傳 null', () => {
  assert.equal(simpleMovingAverage([1, 2, 3], 5), null);
});

test('simpleMovingAverage: 只取最近 N 筆的平均，不是全部歷史', () => {
  // 最近 3 筆是 [3,4,5]，平均 4；前面的 [1,2] 不應該被算進去。
  assert.equal(simpleMovingAverage([1, 2, 3, 4, 5], 3), 4);
});

test('exponentialMovingAverageSeries: 資料筆數不足時整段都是 null', () => {
  const series = exponentialMovingAverageSeries([1, 2, 3], 5);
  assert.deepEqual(series, [null, null, null]);
});

test('exponentialMovingAverageSeries: 種子是前 window 筆的 SMA，之後遞迴平滑', () => {
  const values = [1, 2, 3, 4, 5];
  const series = exponentialMovingAverageSeries(values, 3);
  assert.equal(series[0], null);
  assert.equal(series[1], null);
  assert.equal(series[2], 2); // SMA(1,2,3) = 2
  const k = 2 / 4; // window=3 -> k = 2/(3+1)
  const expectedIndex3 = Math.round((values[3]! * k + series[2]! * (1 - k)) * 10000) / 10000;
  assert.equal(series[3], expectedIndex3);
});

test('bollingerBands: 全部相同收盤價時標準差為 0，上下軌等於中軌', () => {
  const result = bollingerBands([100, 100, 100, 100], 4, 2);
  assert.deepEqual(result, { middle: 100, upper: 100, lower: 100 });
});

test('bollingerBands: 資料筆數不足回傳 null', () => {
  assert.equal(bollingerBands([100, 101], 20, 2), null);
});

test('wilderRsi: 資料筆數不足（少於 window+1 筆）回傳 null', () => {
  assert.equal(wilderRsi([1, 2, 3], 6), null);
});

test('wilderRsi: 期間內完全沒有下跌時應該是 100', () => {
  const closes = [1, 2, 3, 4, 5, 6, 7];
  assert.equal(wilderRsi(closes, 6), 100);
});

test('wilderRsi: 期間內完全沒有上漲時應該接近 0', () => {
  const closes = [7, 6, 5, 4, 3, 2, 1];
  assert.equal(wilderRsi(closes, 6), 0);
});

test('averageTrueRange: 資料筆數不足回傳 null', () => {
  assert.equal(averageTrueRange([10, 11], [9, 10], [9.5, 10.5], 14), null);
});

test('averageTrueRange: 高低不動、收盤不動時 ATR 應該是 0', () => {
  const highs = new Array(15).fill(10);
  const lows = new Array(15).fill(10);
  const closes = new Array(15).fill(10);
  assert.equal(averageTrueRange(highs, lows, closes, 14), 0);
});

test('stochasticKD: 資料筆數不足回傳 null', () => {
  assert.equal(stochasticKD([10, 11], [9, 10], [9.5, 10.5], 9), null);
});

test('stochasticKD: K/D 應該落在 0~100 之間', () => {
  const highs = [10, 11, 12, 11, 10, 9, 8, 9, 10, 11, 12];
  const lows = [9, 10, 11, 10, 9, 8, 7, 8, 9, 10, 11];
  const closes = [9.5, 10.5, 11.5, 10.5, 9.5, 8.5, 7.5, 8.5, 9.5, 10.5, 11.5];
  const result = stochasticKD(highs, lows, closes, 9);
  assert.ok(result !== null);
  assert.ok(result!.k >= 0 && result!.k <= 100);
  assert.ok(result!.d >= 0 && result!.d <= 100);
});

test('bias: 收盤高於均線時是正值，低於均線時是負值', () => {
  assert.equal(bias(110, 100), 10);
  assert.equal(bias(90, 100), -10);
});

test('bias: 均線為零時回傳 null（防呆，理論上不該發生）', () => {
  assert.equal(bias(10, 0), null);
});

test('onBalanceVolume: 收盤價一路上漲，OBV 應該等於總成交量', () => {
  const closes = [10, 11, 12, 13];
  const volumes = [100n, 200n, 300n, 400n];
  assert.equal(onBalanceVolume(closes, volumes), 200n + 300n + 400n);
});

test('onBalanceVolume: 收盤價一路下跌，OBV 應該是負的總成交量', () => {
  const closes = [13, 12, 11, 10];
  const volumes = [100n, 200n, 300n, 400n];
  assert.equal(onBalanceVolume(closes, volumes), -(200n + 300n + 400n));
});

test('onBalanceVolume: 收盤價打平那天不影響 OBV', () => {
  const closes = [10, 10, 11];
  const volumes = [100n, 200n, 300n];
  assert.equal(onBalanceVolume(closes, volumes), 300n);
});
