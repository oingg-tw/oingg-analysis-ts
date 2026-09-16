import { test, describe, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { runScreener, runScreenerRanking, runScreenerValues, ScreenerValidationError } from '@/api/bff/screener/service';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import { loadIndustryCodes } from '@/infrastructure/repositories/exchange/industryCodes';

// sectorCodes 篩選（resolveIndustryCandidateSymbols）依賴模組層級的 sectorCodes 快取，
// 跟正式環境靠 src/index.ts 在伺服器啟動時載入一次不同，測試檔案各自獨立的模組實例需要自己
// 觸發一次載入，否則 isValidSecuritiesIndustryCode 一律查無資料、sectorCodes 測試會全部
// 誤判成無效代碼。用的是證交所類股代碼（twse-ts/tpex-ts company_profile.industry），不是
// 財政部稅籍分類——2330（台積電）實測屬於 24 半導體業，2317（鴻海）屬於 31 其他電子業。
beforeAll(async () => {
  await loadIndustryCodes();
});

// 2026-09-08 重建：舊架構的 screener（靠 metricTableRegistry 解析「一指標一表」）已經隨
// filterCatalog 一起退場（見 abstract-crafting-journal.md「filterCatalog/screener 整套
// 機制退場」）。bff-ts 回報這其實是 web-nuxt「自訂篩選」這個獨立於任何選股模板之外的活
// 功能唯一資料來源，使用者拍板重建——這次改成直接查 pitMetrics 共用的 metric_values 表，
// field 格式從 "metricKey.fieldKey" 改成 "metricCode.timeframe"（例如 "roe.TTM"）。
//
// 用 roe.TTM 當主要測試欄位——2330/2317 都有真實非 null 值（2026-09-08 查證：2330≈34.78、
// 2317≈11.15，2330 > 2317），不寫死確切數字（財報重編/backfill 範圍擴大都可能讓數字變動），
// 只斷言「2330 的 roe.TTM 比 2317 高」這個目前穩定成立的相對關係，跟 tests/README.md
// 「不要拿會隨資料庫累積而改變的狀態寫死成斷言」的既有慣例一致。

const baseRequest = { filters: [] as { field: string; min: number | null; max: number | null; exclude?: boolean }[], columns: [] as { field: string }[], page: 1, pageSize: 50 };

describe('runScreener', () => {
  test('單一 filter 命中：roe.TTM >= 0 的公司應該全部滿足門檻', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: 0, max: null }], columns: [{ field: 'roe.TTM' }], pageSize: 200 });
    assert.ok(result.results.length > 0, '應該至少篩得出幾家公司');
    for (const row of result.results) {
      assert.ok(row.values['roe.TTM']!.value! >= 0, `${row.symbol} 的 roe.TTM 不應該小於 0`);
    }
  });

  test('沒有列 columns 時，values 是空物件，不是 undefined', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: 0, max: null }], pageSize: 1 });
    assert.deepEqual(result.results[0]!.values, {});
  });

  test('exclude=true 且 min/max 皆為 null 時，沒有邊界可言，應該篩掉全部', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: null, max: null, exclude: true }], columns: [{ field: 'roe.TTM' }] });
    assert.deepEqual(result.results, []);
    assert.equal(result.count, 0);
  });

  test('columns 缺資料時是 left-join 語意：該欄位 null 但 symbol 仍在結果裡', async () => {
    // roe.TTM 跟 bankNplRatio.Q 的 symbol 集合不完全重疊（bankNplRatio 只有銀行股），
    // 用「沒有 filters，兩個 column-only 欄位」的 UNION 路徑驗證 left-join 語意。
    const result = await runScreener({ ...baseRequest, columns: [{ field: 'roe.TTM' }, { field: 'bankNplRatio.Q' }], pageSize: 500 });
    const missingBankRatio = result.results.find((r) => r.values['bankNplRatio.Q']!.value === null && r.values['roe.TTM']!.value !== null);
    assert.ok(missingBankRatio, '應該找得到至少一筆 roe.TTM 有資料但 bankNplRatio.Q 沒資料的公司（left-join 語意才成立）');
    assert.equal(missingBankRatio!.values['bankNplRatio.Q']!.knowledgeDate, null, 'bankNplRatio.Q 沒資料時 knowledgeDate 也應該是 null');
  });

  test('分頁：count/totalPages 是全部符合條件的總筆數，不是這一頁的筆數', async () => {
    const page1 = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: -999, max: null }], pageSize: 1, page: 1 });
    assert.ok(page1.count >= 2, '總筆數應該至少有 2 家（2330/2317）才有意義驗證分頁');
    assert.equal(page1.totalPages, Math.ceil(page1.count / 1));
    assert.equal(page1.results.length, 1);

    const page2 = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: -999, max: null }], pageSize: 1, page: 2 });
    assert.notDeepEqual(page1.results.map((r) => r.symbol), page2.results.map((r) => r.symbol), '第二頁不應該跟第一頁重複');
  });

  test('sortField="symbol" 應該依 symbol 排序', async () => {
    const result = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: -999, max: null }], sortField: 'symbol', sortOrder: 'desc', pageSize: 5 });
    for (let i = 1; i < result.results.length; i++) {
      assert.ok(result.results[i - 1]!.symbol >= result.results[i]!.symbol, '應該由大到小排序');
    }
  });

  test('sortField 是 columns 裡的 metric 欄位時，2330 的 roe.TTM 應該排在 2317 前面（desc）', async () => {
    // 2026-09-11 全市場回填完成後 roe.TTM 已涵蓋近 2000 家公司，單純 desc + pageSize:200
    // 不再保證 2330/2317 都落在前 200 名內——用 sectorCodes（各自所屬的證交所類股）縮小
    // 候選範圍，確保兩者都在結果集合裡，這是這次新功能剛好能用得上的地方，不是繞路。
    const result = await runScreener({
      ...baseRequest,
      filters: [{ field: 'roe.TTM', min: -999, max: null }],
      columns: [{ field: 'roe.TTM' }],
      sortField: 'roe.TTM',
      sortOrder: 'desc',
      pageSize: 200,
      sectorCodes: ['24', '31'],
    });
    const symbolOrder = result.results.map((r) => r.symbol);
    const index2330 = symbolOrder.indexOf('2330');
    const index2317 = symbolOrder.indexOf('2317');
    assert.ok(index2330 !== -1 && index2317 !== -1, '2330/2317 應該都要出現在結果裡');
    assert.ok(index2330 < index2317, '2330 的 roe.TTM 比 2317 高，desc 排序應該排在前面');
  });

  test('sortField 沒有先出現在 columns 裡應該拋 ScreenerValidationError', async () => {
    await assert.rejects(
      () => runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: -999, max: null }], sortField: 'beta.1Y_1D', sortOrder: 'asc' }),
      ScreenerValidationError,
    );
  });

  test('只給 sortField 不給 sortOrder 應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: -999, max: null }], sortField: 'symbol' }), ScreenerValidationError);
  });

  test('field 格式錯誤（缺少 "."）應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener({ ...baseRequest, filters: [{ field: 'roeTtm', min: 1, max: 2 }] }), ScreenerValidationError);
  });

  test('metricCode 不存在應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener({ ...baseRequest, filters: [{ field: 'notARealMetric.Q', min: 1, max: 2 }] }), ScreenerValidationError);
  });

  test('metricCode 存在但 basis 不支援應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener({ ...baseRequest, filters: [{ field: 'roe.FY', min: 1, max: 2 }] }), ScreenerValidationError);
  });

  test('filters 跟 columns 都是空的應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener(baseRequest), ScreenerValidationError);
  });
});

// 2026-09-11 新增：sectorCodes 產業篩選（先用候選 symbol 集合縮小範圍，再套用既有的
// metricCode 查詢管線）。用的是證交所類股代碼——2330（台積電）實測屬於 24 半導體業，
// 2317（鴻海）屬於 31 其他電子業，用來驗證篩選真的有排除不屬於該類股的公司，不是誤判
// 成全部通過。
describe('runScreener with sectorCodes', () => {
  test('只給 sectorCodes（不搭配數字篩選），回傳的公司都屬於該產業', async () => {
    const result = await runScreener({ ...baseRequest, columns: [{ field: 'roe.TTM' }], sectorCodes: ['24'], pageSize: 200 });
    assert.ok(result.results.some((r) => r.symbol === '2330'), '2330 屬於 24，應該出現在結果裡');
    assert.ok(!result.results.some((r) => r.symbol === '2317'), '2317 不屬於 24，不應該出現在結果裡');
  });

  test('sectorCodes + 數字篩選（roe.TTM）組合，交集正確：candidate 但不滿足數字條件的公司應該被排除', async () => {
    const withoutFilter = await runScreener({ ...baseRequest, columns: [{ field: 'roe.TTM' }], sectorCodes: ['24'], pageSize: 200 });
    const withFilter = await runScreener({
      ...baseRequest,
      filters: [{ field: 'roe.TTM', min: 0, max: null }],
      columns: [{ field: 'roe.TTM' }],
      sectorCodes: ['24'],
      pageSize: 200,
    });
    assert.ok(withFilter.results.length <= withoutFilter.results.length, '加上數字篩選後結果不應該變多');
    for (const row of withFilter.results) {
      assert.ok(row.values['roe.TTM']!.value! >= 0, `${row.symbol} 應該同時滿足產業跟數字條件`);
    }
  });

  test('給無效產業代碼應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener({ ...baseRequest, columns: [{ field: 'roe.TTM' }], sectorCodes: ['ZZ'] }), ScreenerValidationError);
  });

  test('不給 sectorCodes，行為跟現有測試完全一致（零回歸）：總筆數不受任何候選集合限制', async () => {
    const withIndustry = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: -999, max: null }], columns: [{ field: 'roe.TTM' }], sectorCodes: ['24'], pageSize: 1 });
    const withoutIndustry = await runScreener({ ...baseRequest, filters: [{ field: 'roe.TTM', min: -999, max: null }], columns: [{ field: 'roe.TTM' }], pageSize: 1 });
    assert.ok(withoutIndustry.count > withIndustry.count, '不給 sectorCodes 時總筆數應該遠大於限定單一產業的總筆數（全市場已回填近 2000 家公司）');
  });
});

describe('runScreenerRanking', () => {
  test('desc 排序，2330 應該排在 2317 前面，筆數不超過 limit', async () => {
    const result = await runScreenerRanking({ field: 'roe.TTM', direction: 'desc', limit: 5, columns: [] });
    assert.ok(result.results.length <= 5);
    const symbolOrder = result.results.map((r) => r.symbol);
    const index2330 = symbolOrder.indexOf('2330');
    const index2317 = symbolOrder.indexOf('2317');
    if (index2330 !== -1 && index2317 !== -1) assert.ok(index2330 < index2317);
    for (let i = 1; i < result.results.length; i++) {
      const prev = result.results[i - 1]!.values['roe.TTM']!.value!;
      const curr = result.results[i]!.values['roe.TTM']!.value!;
      assert.ok(prev >= curr, '應該由大到小排序');
    }
  });

  test('排序欄位本身一定會出現在 values 裡，且保證非 null（WHERE value IS NOT NULL）', async () => {
    const result = await runScreenerRanking({ field: 'roe.TTM', direction: 'asc', limit: 5, columns: [] });
    for (const row of result.results) {
      assert.ok('roe.TTM' in row.values, '排序欄位應該自動出現在 values 裡');
      assert.ok(row.values['roe.TTM']!.value !== null, '排序用的欄位不應該是 null');
    }
  });

  test('knowledgeDate 是 YYYY-MM-DD 格式（knowledge_date）', async () => {
    const result = await runScreenerRanking({ field: 'roe.TTM', direction: 'desc', limit: 1, columns: [] });
    assert.match(result.results[0]!.values['roe.TTM']!.knowledgeDate!, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('sectorCodes：排行結果只會出現該產業的公司（2317 不屬於 24，不應該出現）', async () => {
    const result = await runScreenerRanking({ field: 'roe.TTM', direction: 'desc', limit: 50, columns: [], sectorCodes: ['24'] });
    assert.ok(!result.results.some((r) => r.symbol === '2317'));
  });

  test('sectorCodes 給無效代碼應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreenerRanking({ field: 'roe.TTM', direction: 'desc', limit: 5, columns: [], sectorCodes: ['ZZ'] }), ScreenerValidationError);
  });
});

describe('runScreenerValues', () => {
  test('每個要求的 symbol 都會出現在結果裡，查無資料的 symbol 不會被拿掉', async () => {
    const result = await runScreenerValues({ symbols: ['2330', '0000'], columns: [{ field: 'roe.TTM' }] });
    assert.equal(result.results.length, 2);
    const missing = result.results.find((r) => r.symbol === '0000');
    const found = result.results.find((r) => r.symbol === '2330');
    assert.ok(missing, '查無資料的 symbol 也應該出現在結果裡');
    assert.deepEqual(missing!.values['roe.TTM'], { value: null, knowledgeDate: null, nullReason: null });
    assert.ok(found!.values['roe.TTM']!.value !== null, '2330 應該查得到 ROE(TTM)');
  });

  test('重複的 symbol 應該去重，不會出現兩筆一樣的結果', async () => {
    const result = await runScreenerValues({ symbols: ['2330', '2330'], columns: [{ field: 'roe.TTM' }] });
    assert.equal(result.results.length, 1);
  });

  test('symbols 是空陣列應該回傳空結果，不拋錯', async () => {
    const result = await runScreenerValues({ symbols: [], columns: [{ field: 'roe.TTM' }] });
    assert.deepEqual(result.results, []);
  });

  test('查不到的 field 應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreenerValues({ symbols: ['2330'], columns: [{ field: 'notARealMetric.Q' }] }), ScreenerValidationError);
  });
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
});
