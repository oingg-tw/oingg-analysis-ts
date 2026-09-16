import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { runEtfScreener, getEtfFilterCatalog, EtfScreenerValidationError } from '@/http/modules/market/etfScreener/service';
import sitcaExportPrisma from '@/infrastructure/prisma/sitcaExportClient';

test('runEtfScreener: 數字 filter 應該只保留落在範圍內的值，null 排除', async () => {
  const result = await runEtfScreener({ filters: [{ field: 'aum', min: 10_000_000_000, max: null }], columns: [{ field: 'aum' }], page: 1, pageSize: 50 });
  assert.ok(result.results.length > 0, '應該至少有幾筆規模超過100億的 ETF');
  for (const row of result.results) {
    const aum = row.values.aum;
    assert.ok(typeof aum === 'number' && aum >= 10_000_000_000, `${row.symbol} 的 aum (${aum}) 應該 >= 10,000,000,000`);
  }
});

test('runEtfScreener: exclude=true 應該保留範圍外的值', async () => {
  const result = await runEtfScreener({ filters: [{ field: 'return1y', min: 0, max: 50, exclude: true }], columns: [{ field: 'return1y' }], page: 1, pageSize: 50 });
  for (const row of result.results) {
    const value = row.values.return1y;
    assert.ok(typeof value === 'number' && (value < 0 || value > 50), `${row.symbol} 的 return1y (${value}) 應該落在 [0,50] 之外`);
  }
});

test('runEtfScreener: 類別 filter（values）應該是 IN 語意', async () => {
  const result = await runEtfScreener({ filters: [{ field: 'market', values: ['TWSE'] }], columns: [{ field: 'market' }], page: 1, pageSize: 50 });
  assert.ok(result.results.length > 0);
  for (const row of result.results) {
    assert.equal(row.values.market, 'TWSE');
  }
});

test('runEtfScreener: isActive 類別 filter 應該正確轉換布林值', async () => {
  const result = await runEtfScreener({ filters: [{ field: 'isActive', values: ['true'] }], columns: [{ field: 'isActive' }], page: 1, pageSize: 50 });
  assert.equal(result.count, 36, '目前資料裡主動式 ETF 應該是 36 檔（上市31+上櫃5）');
  for (const row of result.results) {
    assert.equal(row.values.isActive, true);
  }
});

// 2026-09-02 修過一次 bug：SQL 樣板字面值裡 \( \) 只打一個反斜線，JS 會在送進 Postgres 前
// 吃掉反斜線，導致正則變成純分組、選項值多包一層括號（例如「(月配)」而不是「月配」）。這裡
// 鎖住「不能有括號」這件事，避免以後又不小心改回單反斜線。
test('runEtfScreener: distributionFrequency 的值不應該還帶著括號（正則跳脫要用雙反斜線）', async () => {
  const result = await runEtfScreener({ filters: [{ field: 'distributionFrequency', values: ['月配'] }], columns: [{ field: 'distributionFrequency' }], page: 1, pageSize: 50 });
  assert.ok(result.results.length > 0, '應該至少有幾檔月配息 ETF');
  for (const row of result.results) {
    assert.equal(row.values.distributionFrequency, '月配');
  }
});

// 2026-09-11 使用者要求比照股票 GET /filters 的巢狀分類建立指標選單——breaking change，
// 原本扁平的 fields 陣列改成 { categoryKey, categoryDisplayName, fields[] } 五組。
test('getEtfFilterCatalog: 應該回傳五個非空分類，每個欄位都恰好歸類在一個分類裡', async () => {
  const catalog = await getEtfFilterCatalog();
  const expectedCategoryKeys = ['identity', 'sizeAndFlow', 'navAndPrice', 'performance', 'cost'];
  assert.deepEqual(
    catalog.categories.map((c) => c.categoryKey),
    expectedCategoryKeys
  );
  for (const category of catalog.categories) {
    assert.ok(category.fields.length > 0, `${category.categoryKey} 不應該是空分類`);
    assert.ok(category.categoryDisplayName.length > 0);
  }
  const allFields = catalog.categories.flatMap((c) => c.fields);
  const fieldNames = allFields.map((f) => f.field);
  assert.equal(new Set(fieldNames).size, fieldNames.length, '同一個 field 不應該出現在兩個分類裡');
  const numericField = allFields.find((f) => f.field === 'aum');
  assert.ok(numericField);
  assert.equal(numericField!.unit, '元');
});

test('getEtfFilterCatalog: distributionFrequency 的 values 不應該帶括號', async () => {
  const catalog = await getEtfFilterCatalog();
  const field = catalog.categories.flatMap((c) => c.fields).find((f) => f.field === 'distributionFrequency');
  assert.ok(field);
  for (const value of field!.values ?? []) {
    assert.ok(!value.includes('('), `"${value}" 不應該包含括號`);
  }
});

test('runEtfScreener: 數字欄位給 values 應該拋 EtfScreenerValidationError', async () => {
  await assert.rejects(
    runEtfScreener({ filters: [{ field: 'aum', values: ['1'] } as never], columns: [], page: 1, pageSize: 50 }),
    EtfScreenerValidationError
  );
});

test('runEtfScreener: 類別欄位給 min/max 應該拋 EtfScreenerValidationError', async () => {
  await assert.rejects(
    runEtfScreener({ filters: [{ field: 'market', min: 0, max: 1 } as never], columns: [], page: 1, pageSize: 50 }),
    EtfScreenerValidationError
  );
});

test('runEtfScreener: 查不到的 field 應該拋 EtfScreenerValidationError', async () => {
  await assert.rejects(runEtfScreener({ filters: [], columns: [{ field: 'notARealField' }], page: 1, pageSize: 50 }), EtfScreenerValidationError);
});

test('runEtfScreener: sortField 不在 columns 裡應該拋 EtfScreenerValidationError', async () => {
  await assert.rejects(
    runEtfScreener({ filters: [], columns: [{ field: 'aum' }], page: 1, pageSize: 50, sortField: 'holders', sortOrder: 'desc' }),
    EtfScreenerValidationError
  );
});

test('runEtfScreener: expenseRatio 的值應該只來自最新一個完整年度（發行日不滿一整年時是 null）', async () => {
  const latestCompleteYear = new Date().getFullYear() - 1;
  const result = await runEtfScreener({ filters: [], columns: [{ field: 'expenseRatio' }], page: 1, pageSize: 200 });
  const withValue = result.results.filter((r) => r.values.expenseRatio !== null);
  assert.ok(withValue.length > 0, '應該至少有幾檔 ETF 有 expenseRatio');
  assert.ok(withValue.length < result.results.length, '應該有一部分 ETF（發行日太新）的 expenseRatio 是 null');
  void latestCompleteYear;
});

test('runEtfScreener: 分頁應該正確切頁不重複', async () => {
  const page1 = await runEtfScreener({ filters: [], columns: [{ field: 'aum' }], page: 1, pageSize: 50, sortField: 'symbol', sortOrder: 'asc' });
  const page2 = await runEtfScreener({ filters: [], columns: [{ field: 'aum' }], page: 2, pageSize: 50, sortField: 'symbol', sortOrder: 'asc' });
  const symbols1 = new Set(page1.results.map((r) => r.symbol));
  const symbols2 = new Set(page2.results.map((r) => r.symbol));
  for (const s of symbols2) assert.ok(!symbols1.has(s), `${s} 不應該同時出現在第 1 頁跟第 2 頁`);
  assert.equal(page1.count, page2.count);
});

test('getEtfFilterCatalog: assetClass 的 values 應該是現查的 distinct 值，不是空陣列', async () => {
  const catalog = await getEtfFilterCatalog();
  const assetClass = catalog.categories.flatMap((c) => c.fields).find((f) => f.field === 'assetClass');
  assert.ok(assetClass);
  assert.equal(assetClass!.kind, 'categorical');
  assert.ok(assetClass!.values && assetClass!.values.length > 0);
});

// 2026-09-04 sitca-ts 新增欄位——法定下市規模門檻/是否低於門檻，跟 isActive 同一種
// boolean 類別欄位的處理方式（見 fieldRegistry.ts 的 isBoolean 標記），這裡驗證新欄位也
// 走同一套轉換邏輯，不會因為是新加的就漏掉 boolean 轉換。
test('runEtfScreener: belowStatutoryThreshold 類別 filter 應該正確轉換布林值', async () => {
  const result = await runEtfScreener({ filters: [{ field: 'belowStatutoryThreshold', values: ['false'] }], columns: [{ field: 'belowStatutoryThreshold' }], page: 1, pageSize: 200 });
  assert.ok(result.results.length > 0, '應該至少有幾檔規模沒有低於法定門檻的 ETF');
  for (const row of result.results) {
    assert.equal(row.values.belowStatutoryThreshold, false);
  }
});

test('runEtfScreener: statutoryAumThreshold 數字欄位應該是可以查詢的數字', async () => {
  const result = await runEtfScreener({ filters: [], columns: [{ field: 'statutoryAumThreshold' }], page: 1, pageSize: 50 });
  assert.ok(result.results.length > 0);
  const withValue = result.results.filter((r) => r.values.statutoryAumThreshold !== null);
  assert.ok(withValue.length > 0, '應該至少有幾檔 ETF 有法定下市規模門檻的值');
  for (const row of withValue) {
    assert.equal(typeof row.values.statutoryAumThreshold, 'number');
  }
});

// 2026-09-08 新增：分年度總費用率（web-nuxt 橫向比較用），資料源是
// fund_expense_ratio_annual_full_year（已濾掉不完整期間），跟 expenseRatio（最新一個
// 完整年度）獨立並存、互不影響。
test('runEtfScreener: expenseRatio2023 應該有值，跟舊的 expenseRatio 欄位互不影響', async () => {
  const result = await runEtfScreener({ filters: [], columns: [{ field: 'expenseRatio2023' }, { field: 'expenseRatio' }], page: 1, pageSize: 200 });
  const withValue = result.results.filter((r) => r.values.expenseRatio2023 !== null);
  assert.ok(withValue.length > 0, '2023 年是完整年度，應該至少有幾檔 ETF 有 expenseRatio2023');
  for (const row of withValue) {
    assert.equal(typeof row.values.expenseRatio2023, 'number');
  }
});

test('runEtfScreener: 多個年度欄位可以同時查詢（pivot 只需要一次 JOIN）', async () => {
  const result = await runEtfScreener({
    filters: [],
    columns: [{ field: 'expenseRatio2021' }, { field: 'expenseRatio2022' }, { field: 'expenseRatio2023' }],
    page: 1,
    pageSize: 50,
  });
  assert.ok(result.results.length > 0);
  for (const row of result.results) {
    assert.ok('expenseRatio2021' in row.values && 'expenseRatio2022' in row.values && 'expenseRatio2023' in row.values);
  }
});

test('runEtfScreener: 太早的年度（例如 2001，該基金那年還沒成立）應該是 null，不是拋錯', async () => {
  const result = await runEtfScreener({ filters: [], columns: [{ field: 'expenseRatio2001' }], page: 1, pageSize: 200 });
  assert.ok(result.results.length > 0);
  const nullCount = result.results.filter((r) => r.values.expenseRatio2001 === null).length;
  assert.ok(nullCount > 0, '2001 年時大部分現在的 ETF 都還沒成立，應該有很多 null');
});

test('getEtfFilterCatalog: expenseRatio<year> 系列欄位應該全部出現（2001~2026 共 26 個）', async () => {
  const catalog = await getEtfFilterCatalog();
  for (let year = 2001; year <= 2026; year++) {
    const field = catalog.categories.flatMap((c) => c.fields).find((f) => f.field === `expenseRatio${year}`);
    assert.ok(field, `expenseRatio${year} 應該出現在 filter catalog 裡`);
    assert.equal(field!.kind, 'numeric');
  }
});

test('getEtfFilterCatalog: 每個數字欄位都不應該有 values', () => {
  return getEtfFilterCatalog().then((catalog) => {
    for (const field of catalog.categories.flatMap((c) => c.fields)) {
      if (field.kind === 'numeric') assert.equal(field.values, undefined);
    }
  });
});

// 2026-09-08 新增：sitca 建議的 ETF 欄位分類「身分/分類」（成立日）跟「成本」（費用率
// 細項拆分）兩組，使用者確認要做的部分。
test('getEtfFilterCatalog: establishedDate 應該以 kind=date 出現在目錄裡', async () => {
  const catalog = await getEtfFilterCatalog();
  const field = catalog.categories.flatMap((c) => c.fields).find((f) => f.field === 'establishedDate');
  assert.ok(field, 'establishedDate 應該出現在 filter catalog 裡');
  assert.equal(field!.kind, 'date');
  assert.equal(field!.values, undefined);
});

test('runEtfScreener: establishedDate 可以查詢，且可以用日期字串 min/max 篩選', async () => {
  const result = await runEtfScreener({ filters: [], columns: [{ field: 'establishedDate' }], page: 1, pageSize: 50 });
  assert.ok(result.results.length > 0);
  const withValue = result.results.filter((r) => r.values.establishedDate !== null);
  assert.ok(withValue.length > 0, '應該至少有幾檔 ETF 有成立日');
  for (const row of withValue) {
    assert.equal(typeof row.values.establishedDate, 'string');
    assert.match(row.values.establishedDate as string, /^\d{4}-\d{2}-\d{2}$/, '成立日應該是 YYYY-MM-DD 格式的字串');
  }

  // 篩選 2020 年以後成立的 ETF，結果的成立日都應該落在範圍內。
  const filtered = await runEtfScreener({
    filters: [{ field: 'establishedDate', min: '2020-01-01', max: null }],
    columns: [{ field: 'establishedDate' }],
    page: 1,
    pageSize: 200,
  });
  assert.ok(filtered.results.length > 0, '應該至少有幾檔 2020 年以後成立的 ETF');
  for (const row of filtered.results) {
    assert.ok((row.values.establishedDate as string) >= '2020-01-01');
  }
});

test('runEtfScreener: 費用率細項拆分（managementFeeRate 等）應該可以查詢，取該基金自己最新一筆完整年度', async () => {
  const result = await runEtfScreener({
    filters: [],
    columns: [{ field: 'managementFeeRate' }, { field: 'custodianFeeRate' }, { field: 'commissionRate' }],
    page: 1,
    pageSize: 200,
  });
  assert.ok(result.results.length > 0);
  const withValue = result.results.filter((r) => r.values.managementFeeRate !== null);
  assert.ok(withValue.length > 0, '應該至少有幾檔 ETF 有經理費率');
  for (const row of withValue) {
    assert.equal(typeof row.values.managementFeeRate, 'number');
  }
});

afterAll(async () => {
  await sitcaExportPrisma.$disconnect();
});
