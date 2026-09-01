import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { runScreener, runScreenerRanking, ScreenerValidationError } from '@/domains/screener/service';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

const baseRequest = { filters: [] as { field: string; min: number | null; max: number | null; exclude?: boolean }[], columns: [] as { field: string }[], page: 1, pageSize: 50 };

describe('runScreener', () => {
  test('單一 filter 命中：roe >= 5 的公司應該全部滿足門檻', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'roe.roeQuarterlyPct', min: 5, max: null }], columns: [{ field: 'roe.roeQuarterlyPct' }], pageSize: 200 });
    assert.ok(result.results.length > 0, '應該至少篩得出幾家公司');
    for (const row of result.results) {
      assert.ok(row.values['roe.roeQuarterlyPct']!.value! >= 5, `${row.symbol} 的 roe 不應該小於 5`);
    }
  });

  test('沒有列 columns 時，values 是空物件，不是 undefined', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'roe.roeQuarterlyPct', min: 5, max: null }], pageSize: 1 });
    assert.deepEqual(result.results[0]!.values, {});
  });

  test('多個 filter 疊加是 AND，且 INNER JOIN 語意——同時滿足 roe 跟 debtRatio 門檻才會出現', async () => {
    const result = await runScreener({
      ...baseRequest,
      filters: [
        { field: 'roe.roeQuarterlyPct', min: 5, max: null },
        { field: 'debtRatio.debtRatioPct', min: null, max: 50 },
      ],
      columns: [{ field: 'roe.roeQuarterlyPct' }, { field: 'debtRatio.debtRatioPct' }],
      pageSize: 200,
    });
    for (const row of result.results) {
      const roe = row.values['roe.roeQuarterlyPct']!.value!;
      const debtRatio = row.values['debtRatio.debtRatioPct']!.value!;
      assert.ok(roe >= 5, `${row.symbol} 的 roe=${roe} 不應該小於 5`);
      assert.ok(debtRatio <= 50, `${row.symbol} 的 debtRatio=${debtRatio} 不應該大於 50`);
    }
  });

  test('exclude=true 保留範圍外的值，範圍內的值不應該出現', async () => {
    const result = await runScreener({
      ...baseRequest,
      filters: [{ field: 'roe.roeQuarterlyPct', min: 5, max: 10, exclude: true }],
      columns: [{ field: 'roe.roeQuarterlyPct' }],
      pageSize: 200,
    });
    for (const row of result.results) {
      const roe = row.values['roe.roeQuarterlyPct']!.value!;
      assert.ok(roe < 5 || roe > 10, `${row.symbol} 的 roe=${roe} 不應該落在 [5,10] 之間`);
    }
  });

  test('exclude=true 且 min/max 皆為 null 時，沒有邊界可言，應該篩掉全部', async () => {
    const result = await runScreener({
      ...baseRequest,
      filters: [{ field: 'roe.roeQuarterlyPct', min: null, max: null, exclude: true }],
      columns: [{ field: 'roe.roeQuarterlyPct' }],
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
    const page1 = await runScreener({ ...baseRequest, filters: [{ field: 'roe.roeQuarterlyPct', min: 0, max: null }], pageSize: 2, page: 1 });
    assert.ok(page1.count > 2, '總筆數應該遠大於一頁的筆數才有意義驗證分頁');
    assert.equal(page1.totalPages, Math.ceil(page1.count / 2));
    assert.equal(page1.results.length, 2);

    const page2 = await runScreener({ ...baseRequest, filters: [{ field: 'roe.roeQuarterlyPct', min: 0, max: null }], pageSize: 2, page: 2 });
    assert.notDeepEqual(page1.results.map((r) => r.symbol), page2.results.map((r) => r.symbol), '第二頁不應該跟第一頁重複');
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
    const result = await runScreenerRanking({ field: 'roe.roeQuarterlyPct', direction: 'desc', limit: 5, columns: [] });
    assert.ok(result.results.length <= 5);
    for (let i = 1; i < result.results.length; i++) {
      const prev = result.results[i - 1]!.values['roe.roeQuarterlyPct']!.value!;
      const curr = result.results[i]!.values['roe.roeQuarterlyPct']!.value!;
      assert.ok(prev >= curr, '應該由大到小排序');
    }
  });

  test('排序欄位本身一定會出現在 values 裡，不用另外列進 columns', async () => {
    const result = await runScreenerRanking({ field: 'roe.roeQuarterlyPct', direction: 'asc', limit: 3, columns: [] });
    for (const row of result.results) {
      assert.ok('roe.roeQuarterlyPct' in row.values, '排序欄位應該自動出現在 values 裡');
      assert.ok(row.values['roe.roeQuarterlyPct']!.value !== null, '排序用的欄位不應該是 null（WHERE IS NOT NULL 應該排除掉）');
    }
  });

  test('Q 型欄位的 asOfDate 是 "西元年後兩碼Q季度" 格式', async () => {
    const result = await runScreenerRanking({ field: 'roe.roeQuarterlyPct', direction: 'desc', limit: 1, columns: [] });
    assert.match(result.results[0]!.values['roe.roeQuarterlyPct']!.asOfDate!, /^\d{2}Q[1-4]$/);
  });

  test('D 型欄位的 asOfDate 是 YYYY-MM-DD 格式', async () => {
    const result = await runScreenerRanking({ field: 'per.peRatio', direction: 'desc', limit: 1, columns: [] });
    assert.match(result.results[0]!.values['per.peRatio']!.asOfDate!, /^\d{4}-\d{2}-\d{2}$/);
  });
});

after(async () => {
  await analysisPrisma.$disconnect();
});
