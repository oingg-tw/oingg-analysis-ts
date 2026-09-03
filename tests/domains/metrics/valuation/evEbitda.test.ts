import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEvEbitda } from '@/domainApi/metrics/valuation/evEbitda/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// EV_EBITDA 用到逐日更新的股價資料，數值每天在變，不釘死確切數字，只驗證合理性——
// 跟 altmanZScore 的 X4/zScore 同一種測試風格，見 tests/README.md。
test('evEbitda: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateEvEbitda({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, '115');
  assert.equal(result.season, '2');
  assert.equal(result.reportDate, '2026-06-30');

  assert.ok(result.marketCap.value !== null && result.marketCap.value > 0);
  assert.ok(result.netDebt.value !== null, '2330 資產負債表資料齊全，本季淨負債應該算得出來');
  assert.ok(result.enterpriseValue.value !== null, '市值跟淨負債都有，企業價值應該算得出來');

  assert.ok(result.ebitdaTtm.value !== null, '2330 財報資料齊全，TTM EBITDA 應該算得出來');
  assert.ok(result.evToEbitdaTtm !== null);
  // EV_EBITDA 沒有理論上限，但個股落在 0~1000 之外基本上代表單位換算算錯了（差 1000 倍那種坑）。
  assert.ok(result.evToEbitdaTtm! > 0 && result.evToEbitdaTtm! < 1000, `evToEbitdaTtm=${result.evToEbitdaTtm} 數量級異常`);

  assert.deepEqual(result.fieldStatuses, {});
});

test('evEbitda: 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateEvEbitda({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateEvEbitda({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.netDebt.value, explicit.netDebt.value);
});

test('evEbitda: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateEvEbitda({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.evToEbitdaQuarterlyAnnualized, null);
  assert.equal(result.evToEbitdaTtm, null);
  assert.equal(result.fieldStatuses.evToEbitdaQuarterlyAnnualized?.status, 'no_data');
  assert.equal(result.fieldStatuses.evToEbitdaTtm?.status, 'no_data');
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
