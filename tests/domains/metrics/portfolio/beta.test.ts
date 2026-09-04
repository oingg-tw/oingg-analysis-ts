import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateBeta, resample, type OverlapPoint } from '@/domainBatch/metrics/portfolio/beta/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

const point = (tradeDate: string): OverlapPoint => ({ tradeDate, stockClose: 100, indexClose: 100 });

test('resample: daily 原封不動回傳', () => {
  const points = [point('2026-01-05'), point('2026-01-06')];
  assert.deepEqual(resample(points, 'daily'), points);
});

test('resample: weekly 只留每個 ISO 週最後一個交易日', () => {
  // 2026-01-05（週一）~ 2026-01-09（週五）是同一個 ISO 週；2026-01-12（週一）是下一週。
  const points = [
    point('2026-01-05'),
    point('2026-01-06'),
    point('2026-01-07'),
    point('2026-01-08'),
    point('2026-01-09'),
    point('2026-01-12'),
    point('2026-01-13'),
  ];
  const result = resample(points, 'weekly');
  assert.deepEqual(
    result.map((p) => p.tradeDate),
    ['2026-01-09', '2026-01-13'],
  );
});

test('resample: weekly 正確處理跨年邊界（ISO 週以週四所在年份為準）', () => {
  // 2025-12-29（週一）~ 2026-01-02（週五）這一週的週四是 2026-01-01，屬於 2026 年第 1 週，
  // 不是 2025 年最後一週——如果分桶邏輯用「日期所在西元年」而不是 ISO 年，這裡會被誤判成兩個桶。
  const points = [point('2025-12-29'), point('2025-12-30'), point('2025-12-31'), point('2026-01-02')];
  const result = resample(points, 'weekly');
  assert.equal(result.length, 1, '跨年但屬於同一個 ISO 週的交易日應該只算一個取樣點');
  assert.equal(result[0]!.tradeDate, '2026-01-02');
});

test('resample: monthly 只留每個月最後一個交易日', () => {
  const points = [point('2026-01-30'), point('2026-02-27'), point('2026-02-28')];
  const result = resample(points, 'monthly');
  assert.deepEqual(
    result.map((p) => p.tradeDate),
    ['2026-01-30', '2026-02-28'],
  );
});

// Beta 用的是逐日更新的股價/指數資料（不是季度財報那種固定不變的歷史快照——2026-08-26 開發過程中
// 親眼看過 daily_market_index 的資料一個 session 內就從涵蓋到 06-30 變成涵蓋到 08-26），
// 所以這裡不釘死確切數值，只驗證「合理性」跟「結構」，避免資料每天更新就讓測試炸掉。
test('beta: 2330 有資料，三個窗口都能算出合理範圍內的值', async () => {
  const result = await calculateBeta({ symbol: '2330' });

  assert.equal(result.symbol, '2330');
  assert.ok(result.asOfDate !== null, '2330 應該要能找到重疊交易日當基準日');
  assert.deepEqual(result.fieldStatuses, {}, '2330 目前資料齊全，不應該有任何 fieldStatuses 項目');
  assert.deepEqual(result.warnings, []);

  // 三個窗口取樣頻率不同（1Y 日、2Y 週、5Y 月），不能假設窗口越長取樣點越多——
  // 2Y 週資料（≈104 點）反而比 1Y 日資料（≈252 點）少，這是刻意的降頻設計，不是 bug。
  const expectedFrequency = { beta1Y: 'daily', beta2Y: 'weekly', beta5Y: 'monthly' } as const;
  const roughlyExpectedObservations = { beta1Y: 252, beta2Y: 104, beta5Y: 60 } as const;

  for (const key of ['beta1Y', 'beta2Y', 'beta5Y'] as const) {
    const window = result[key];
    assert.ok(window.value !== null, `2330 資料量足夠，${key} 應該算得出 Beta`);
    // Beta 沒有理論上限，但個股 Beta 落在 -5 ~ 5 之外基本上代表算法出錯，不是正常的市場風險係數。
    assert.ok(window.value! > -5 && window.value! < 5, `Beta 值 ${window.value} 超出合理範圍`);
    assert.equal(window.samplingFrequency, expectedFrequency[key]);
    assert.ok(window.observations >= 20, 'observations 應該至少達到最低樣本數門檻');
    // 允許有彈性（資料每天在更新、月初/月底邊界會有 ±1~2 個取樣點的正常誤差），只抓明顯算錯的情況。
    const expected = roughlyExpectedObservations[key];
    assert.ok(
      window.observations >= expected * 0.7 && window.observations <= expected * 1.3,
      `${key} observations=${window.observations}，跟預期的 ${expected}（${window.samplingFrequency}）差太多，可能降頻邏輯錯了`,
    );
    assert.ok(window.windowStart !== null && window.windowEnd !== null);
  }
});

test('beta: 查無資料的公司回傳 not_applicable，不是拋錯或裝作查得到', async () => {
  const result = await calculateBeta({ symbol: '9999' });

  assert.equal(result.symbol, '9999');
  assert.equal(result.asOfDate, null);
  assert.equal(result.beta1Y.value, null);
  assert.equal(result.beta2Y.value, null);
  assert.equal(result.beta5Y.value, null);

  for (const field of ['beta1Y', 'beta2Y', 'beta5Y']) {
    assert.equal(result.fieldStatuses[field]?.status, 'not_applicable');
  }
  assert.ok(result.warnings.length > 0);
});

test('beta: asOfDate 指定成非重疊交易日時，會自動退回最近的重疊交易日', async () => {
  // 用一個確定在資料範圍內、但刻意選週末的日期（不會是交易日），驗證退回邏輯不會直接回傳 null。
  const result = await calculateBeta({ symbol: '2330', asOfDate: '2026-01-03' }); // 2026-01-03 是週六
  assert.ok(result.asOfDate !== null);
  assert.notEqual(result.asOfDate, '2026-01-03');
  assert.ok(result.asOfDate! <= '2026-01-03');
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
