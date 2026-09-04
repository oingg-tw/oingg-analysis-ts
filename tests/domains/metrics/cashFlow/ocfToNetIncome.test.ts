import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateOcfToNetIncome } from '@/domainMetrics/cashFlow/ocfToNetIncome/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：mops 修正 quarterly_cash_flow_statement 為真的單季數（之前每季存的其實是
// 當年累計數），本季（單季）OCF 數字也變了，不是只有 TTM 受影響。
test('ocfToNetIncome: 2330 115Q2 合併報表', async () => {
  const result = await calculateOcfToNetIncome({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.ocfToNetIncomeQuarterly, 1.11);
  assert.equal(result.ocfToNetIncomeTtm, 1.18);
  assert.equal(result.operatingCashFlow.value, '783364977');
  assert.equal(result.netIncome.value, '706561938');
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('ocfToNetIncome: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateOcfToNetIncome({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateOcfToNetIncome({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.ocfToNetIncomeQuarterly, explicit.ocfToNetIncomeQuarterly);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('ocfToNetIncome: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateOcfToNetIncome({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.ocfToNetIncomeQuarterly, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
