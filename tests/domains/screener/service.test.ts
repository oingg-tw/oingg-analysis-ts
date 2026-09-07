import { test, describe, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { runScreener, runScreenerRanking, runScreenerValues, ScreenerValidationError } from '@/api/bff/screener/service';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2026-09-07：使用者要求把舊架構「單一指標一張表」的 34 張季報型 Result 表整批 DROP（這批
// 全部已經有 pitMetrics 版本可查）——原本這個檔案大量使用的 roe（RoeResult）跟
// debtRatio（DebtRatioResult）已經不存在了。目前舊架構只剩兩個倖存的日資料型（daily-shape）
// 家族：beta（BetaResult）、marketRatios（MarketRatiosResult，metricKey per/pbr/dividendYield
// 三個都指回同一張表）——全部改用這兩個。真實數字分布（2026-09-07 查證）：
// beta1Y 共 2796 筆非 null，範圍 [-1.34, 2.68]，[0.8,1.2] 區間內 536 筆；peRatio 共 2485 筆
// 非 null，全部 >= 0（min 0.56）。
//
// 因為只剩日資料型（daily-shape）的 model，這個檔案已經沒有真的季報型（quarterly-shape）
// metric 可以整合測試——原本驗證「Q 型欄位 asOfDate 格式」的測試因此移除（沒有活資料可以
// 驅動這個分支），但底層格式化邏輯（formatRocYearSeasonAsOfDate）本身仍有獨立單元測試，見
// tests/shared/rocQuarter.test.ts，不受這次改動影響。

const baseRequest = { filters: [] as { field: string; min: number | null; max: number | null; exclude?: boolean }[], columns: [] as { field: string }[], page: 1, pageSize: 50 };

describe('runScreener', () => {
  test('單一 filter 命中：beta1Y >= 0 的公司應該全部滿足門檻', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'beta.beta1Y', min: 0, max: null }], columns: [{ field: 'beta.beta1Y' }], pageSize: 200 });
    assert.ok(result.results.length > 0, '應該至少篩得出幾家公司');
    for (const row of result.results) {
      assert.ok(row.values['beta.beta1Y']!.value! >= 0, `${row.symbol} 的 beta1Y 不應該小於 0`);
    }
  });

  test('沒有列 columns 時，values 是空物件，不是 undefined', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'beta.beta1Y', min: 0, max: null }], pageSize: 1 });
    assert.deepEqual(result.results[0]!.values, {});
  });

  test('多個 filter 疊加是 AND，且 INNER JOIN 語意——同時滿足 beta 跟 per 門檻才會出現', async () => {
    const result = await runScreener({
      ...baseRequest,
      filters: [
        { field: 'beta.beta1Y', min: 0, max: null },
        { field: 'per.peRatio', min: 0, max: null },
      ],
      columns: [{ field: 'beta.beta1Y' }, { field: 'per.peRatio' }],
      pageSize: 200,
    });
    for (const row of result.results) {
      const beta1Y = row.values['beta.beta1Y']!.value!;
      const peRatio = row.values['per.peRatio']!.value!;
      assert.ok(beta1Y >= 0, `${row.symbol} 的 beta1Y=${beta1Y} 不應該小於 0`);
      assert.ok(peRatio >= 0, `${row.symbol} 的 peRatio=${peRatio} 不應該小於 0`);
    }
  });

  test('exclude=true 保留範圍外的值，範圍內的值不應該出現', async () => {
    const result = await runScreener({
      ...baseRequest,
      filters: [{ field: 'beta.beta1Y', min: 0.8, max: 1.2, exclude: true }],
      columns: [{ field: 'beta.beta1Y' }],
      pageSize: 200,
    });
    for (const row of result.results) {
      const beta1Y = row.values['beta.beta1Y']!.value!;
      assert.ok(beta1Y < 0.8 || beta1Y > 1.2, `${row.symbol} 的 beta1Y=${beta1Y} 不應該落在 [0.8,1.2] 之間`);
    }
  });

  test('exclude=true 且 min/max 皆為 null 時，沒有邊界可言，應該篩掉全部', async () => {
    const result = await runScreener({
      ...baseRequest,
      filters: [{ field: 'beta.beta1Y', min: null, max: null, exclude: true }],
      columns: [{ field: 'beta.beta1Y' }],
    });
    assert.deepEqual(result.results, []);
    assert.equal(result.count, 0);
  });

  test('columns 缺資料時是 left-join 語意：該欄位 null 但 symbol 仍在結果裡', async () => {
    // beta 的 symbol 集合（含 ETF 這種可能沒有 per 資料的標的）跟 per 的集合不完全重疊，
    // 用「沒有 filters，兩個 column-only 表」的 UNION 路徑驗證 left-join 語意。
    const result = await runScreener({ ...baseRequest, columns: [{ field: 'beta.beta1Y' }, { field: 'per.peRatio' }], pageSize: 500 });
    const missingPer = result.results.find((r) => r.values['per.peRatio']!.value === null);
    assert.ok(missingPer, '應該找得到至少一筆 beta 有資料但 per 沒資料的公司（left-join 語意才成立）');
    assert.equal(missingPer!.values['per.peRatio']!.asOfDate, null, 'per 沒資料時 asOfDate 也應該是 null');
    assert.ok(missingPer!.values['beta.beta1Y']!.value !== null, 'beta 本身應該有資料');
  });

  test('分頁：count/totalPages 是全部符合條件的總筆數，不是這一頁的筆數', async () => {
    const page1 = await runScreener({ ...baseRequest, filters: [{ field: 'beta.beta1Y', min: -999, max: null }], pageSize: 2, page: 1 });
    assert.ok(page1.count > 2, '總筆數應該遠大於一頁的筆數才有意義驗證分頁');
    assert.equal(page1.totalPages, Math.ceil(page1.count / 2));
    assert.equal(page1.results.length, 2);

    const page2 = await runScreener({ ...baseRequest, filters: [{ field: 'beta.beta1Y', min: -999, max: null }], pageSize: 2, page: 2 });
    assert.notDeepEqual(page1.results.map((r) => r.symbol), page2.results.map((r) => r.symbol), '第二頁不應該跟第一頁重複');
  });

  test('sortField="symbol" 應該依 symbol 排序', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'beta.beta1Y', min: -999, max: null }], sortField: 'symbol', sortOrder: 'desc', pageSize: 5 });
    for (let i = 1; i < result.results.length; i++) {
      assert.ok(result.results[i - 1]!.symbol >= result.results[i]!.symbol, '應該由大到小排序');
    }
  });

  test('sortField 是 columns 裡的 metric 欄位時，應該依該欄位排序', async () => {
    const result = await runScreener({
      ...baseRequest,
      filters: [{ field: 'beta.beta1Y', min: -999, max: null }],
      columns: [{ field: 'beta.beta1Y' }],
      sortField: 'beta.beta1Y',
      sortOrder: 'asc',
      pageSize: 200,
    });
    for (let i = 1; i < result.results.length; i++) {
      const prev = result.results[i - 1]!.values['beta.beta1Y']!.value!;
      const curr = result.results[i]!.values['beta.beta1Y']!.value!;
      assert.ok(prev <= curr, '應該由小到大排序');
    }
  });

  test('sortField 沒有先出現在 columns 裡應該拋 ScreenerValidationError', async () => {
    await assert.rejects(
      () =>
        runScreener({
          ...baseRequest,
          filters: [{ field: 'beta.beta1Y', min: -999, max: null }],
          sortField: 'per.peRatio',
          sortOrder: 'asc',
        }),
      ScreenerValidationError,
    );
  });

  test('只給 sortField 不給 sortOrder 應該拋 ScreenerValidationError', async () => {
    await assert.rejects(
      () => runScreener({ ...baseRequest, filters: [{ field: 'beta.beta1Y', min: -999, max: null }], sortField: 'symbol' }),
      ScreenerValidationError,
    );
  });

  test('查不到的 field 應該拋 ScreenerValidationError', async () => {
    await assert.rejects(
      () => runScreener({ ...baseRequest, filters: [{ field: 'notARealMetric.x', min: 1, max: 2 }] }),
      ScreenerValidationError,
    );
  });

  test('filters 跟 columns 都是空的應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener(baseRequest), ScreenerValidationError);
  });
});

describe('runScreenerRanking', () => {
  test('排序方向跟 limit：desc 應該由大到小，筆數不超過 limit', async () => {
    const result = await runScreenerRanking({ field: 'beta.beta1Y', direction: 'desc', limit: 5, columns: [] });
    assert.ok(result.results.length <= 5);
    for (let i = 1; i < result.results.length; i++) {
      const prev = result.results[i - 1]!.values['beta.beta1Y']!.value!;
      const curr = result.results[i]!.values['beta.beta1Y']!.value!;
      assert.ok(prev >= curr, '應該由大到小排序');
    }
  });

  test('排序欄位本身一定會出現在 values 裡，不用另外列進 columns', async () => {
    const result = await runScreenerRanking({ field: 'beta.beta1Y', direction: 'asc', limit: 3, columns: [] });
    for (const row of result.results) {
      assert.ok('beta.beta1Y' in row.values, '排序欄位應該自動出現在 values 裡');
      assert.ok(row.values['beta.beta1Y']!.value !== null, '排序用的欄位不應該是 null（WHERE IS NOT NULL 應該排除掉）');
    }
  });

  test('D 型欄位的 asOfDate 是 YYYY-MM-DD 格式', async () => {
    const result = await runScreenerRanking({ field: 'per.peRatio', direction: 'desc', limit: 1, columns: [] });
    assert.match(result.results[0]!.values['per.peRatio']!.asOfDate!, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('runScreenerValues', () => {
  test('每個要求的 symbol 都會出現在結果裡，查無資料的 symbol 不會被拿掉', async () => {
    const result = await runScreenerValues({ symbols: ['2330', '0000'], columns: [{ field: 'beta.beta1Y' }] });
    assert.equal(result.results.length, 2);
    const missing = result.results.find((r) => r.symbol === '0000');
    const found = result.results.find((r) => r.symbol === '2330');
    assert.ok(missing, '查無資料的 symbol 也應該出現在結果裡');
    assert.deepEqual(missing!.values['beta.beta1Y'], { value: null, asOfDate: null });
    assert.ok(found!.values['beta.beta1Y']!.value !== null, '2330 應該查得到 Beta');
  });

  test('重複的 symbol 應該去重，不會出現兩筆一樣的結果', async () => {
    const result = await runScreenerValues({ symbols: ['2330', '2330'], columns: [{ field: 'beta.beta1Y' }] });
    assert.equal(result.results.length, 1);
  });

  test('symbols 是空陣列應該回傳空結果，不拋錯', async () => {
    const result = await runScreenerValues({ symbols: [], columns: [{ field: 'beta.beta1Y' }] });
    assert.deepEqual(result.results, []);
  });

  test('查不到的 field 應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreenerValues({ symbols: ['2330'], columns: [{ field: 'notARealMetric.x' }] }), ScreenerValidationError);
  });
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
});
