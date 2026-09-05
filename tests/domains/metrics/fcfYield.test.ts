import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateFcfYield } from '@/domainMetrics/fcfYield';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// FCF_Yield 用到逐日更新的股價資料，數值每天在變，不釘死確切數字，只驗證合理性——
// 跟 altmanZScore 的 X4/zScore 同一種測試風格，見 tests/README.md。
test('fcfYield: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateFcfYield({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, '115');
  assert.equal(result.season, '2');
  assert.equal(result.reportDate, '2026-06-30');

  assert.ok(result.stockPrice.value !== null && result.stockPrice.value > 0);
  assert.ok(result.fcfPerShareTtm !== null, '2330 現金流量表資料齊全，TTM 每股自由現金流應該算得出來');

  // 2330 自由現金流通常是正數，FCF_Yield 應該算得出正值；不釘死確切數字（股價每天在變）。
  if (result.fcfPerShareTtm !== null && result.fcfPerShareTtm > 0) {
    assert.ok(result.fcfYieldTtmPct !== null);
    // FCF_Yield 沒有理論上限，但個股落在 0~100% 之外基本上代表算法出錯（不是像倍數那種可以破百）。
    assert.ok(result.fcfYieldTtmPct! > 0 && result.fcfYieldTtmPct! < 100, `fcfYieldTtmPct=${result.fcfYieldTtmPct} 數量級異常`);
  }
});

test('fcfYield: 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateFcfYield({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateFcfYield({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.fcfPerShareTtm, explicit.fcfPerShareTtm);
});

test('fcfYield: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateFcfYield({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.fcfYieldQuarterlyAnnualizedPct, null);
  assert.equal(result.fcfYieldTtmPct, null);
  assert.equal(result.fieldStatuses.fcfYieldQuarterlyAnnualizedPct?.status, 'no_data');
  assert.equal(result.fieldStatuses.fcfYieldTtmPct?.status, 'no_data');
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
