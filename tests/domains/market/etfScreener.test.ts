import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { runEtfScreener, getEtfFilterCatalog, EtfScreenerValidationError } from '@/domainApi/market/etfScreener/service';
import sitcaExportPrisma from '@/adapters/prisma/sitcaExportClient';

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

test('getEtfFilterCatalog: distributionFrequency 的 values 不應該帶括號', async () => {
  const catalog = await getEtfFilterCatalog();
  const field = catalog.fields.find((f) => f.field === 'distributionFrequency');
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
  const assetClass = catalog.fields.find((f) => f.field === 'assetClass');
  assert.ok(assetClass);
  assert.equal(assetClass!.kind, 'categorical');
  assert.ok(assetClass!.values && assetClass!.values.length > 0);
});

test('getEtfFilterCatalog: 每個數字欄位都不應該有 values', () => {
  return getEtfFilterCatalog().then((catalog) => {
    for (const field of catalog.fields) {
      if (field.kind === 'numeric') assert.equal(field.values, undefined);
    }
  });
});

after(async () => {
  await sitcaExportPrisma.$disconnect();
});
