import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePsr } from '@/domains/metrics/valuation/psr/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// PSR 用到逐日更新的股價資料，數值每天在變，不釘死確切數字，只驗證合理性——
// 跟 altmanZScore 的 X4/zScore 同一種測試風格，見 tests/README.md。
test('psr: 2330 115Q2 合併報表，指定季度，能算出合理範圍內的值', async () => {
  const result = await calculatePsr({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, '115');
  assert.equal(result.season, '2');
  assert.equal(result.reportDate, '2026-06-30');

  assert.ok(result.psrQuarterlyAnnualized !== null, '2330 有股價跟營收資料，psrQuarterlyAnnualized 應該算得出來');
  assert.ok(result.psrTtm !== null, 'psrTtm 應該算得出來');
  // PSR 沒有理論上限，但個股 PSR 落在 0~1000 之外基本上代表單位換算算錯了（差 1000 倍那種坑）。
  assert.ok(result.psrQuarterlyAnnualized! > 0 && result.psrQuarterlyAnnualized! < 1000, `psrQuarterlyAnnualized=${result.psrQuarterlyAnnualized} 數量級異常`);
  assert.ok(result.psrTtm! > 0 && result.psrTtm! < 1000, `psrTtm=${result.psrTtm} 數量級異常`);

  assert.ok(result.marketCap.value !== null && result.marketCap.value > 0);
  assert.deepEqual(result.fieldStatuses, {});
});

test('psr: 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculatePsr({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculatePsr({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.operatingRevenue.value, explicit.operatingRevenue.value);
});

test('psr: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculatePsr({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.psrQuarterlyAnnualized, null);
  assert.equal(result.psrTtm, null);
  assert.equal(result.fieldStatuses.psrQuarterlyAnnualized?.status, 'no_data');
  assert.equal(result.fieldStatuses.psrTtm?.status, 'no_data');
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
