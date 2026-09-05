import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculatePFcf } from '@/domainMetrics/pFcf';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// P_FCF 用到逐日更新的股價資料，數值每天在變，不釘死確切數字，只驗證合理性——
// 跟 altmanZScore 的 X4/zScore 同一種測試風格，見 tests/README.md。
test('pFcf: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculatePFcf({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, '115');
  assert.equal(result.season, '2');
  assert.equal(result.reportDate, '2026-06-30');

  // 2330 自由現金流通常是正數，P_FCF 應該算得出正值；不釘死確切數字（股價每天在變）。
  if (result.pFcfQuarterlyAnnualized !== null) {
    assert.ok(result.pFcfTtm !== null);
    assert.ok(result.pFcfQuarterlyAnnualized! > 0 && result.pFcfQuarterlyAnnualized! < 1000, `pFcfQuarterlyAnnualized=${result.pFcfQuarterlyAnnualized} 數量級異常`);
  }
});

test('pFcf: 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculatePFcf({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculatePFcf({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.pFcfTtm, explicit.pFcfTtm);
});

test('pFcf: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculatePFcf({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.pFcfQuarterlyAnnualized, null);
  assert.equal(result.pFcfTtm, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
