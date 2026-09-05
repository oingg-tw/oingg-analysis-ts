import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateDividendPayoutRatio } from '@/domainMetrics/dividendPayoutRatio';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domainMetrics/profitability.md「配息率／SGR 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：mops 修正 quarterly_cash_flow_statement 為真的單季數（原本全部季度都是
// 當年累計數，不是只有 Q4），本季（單季）跟 TTM 的股利發放/淨利數字都改變了。
test('dividendPayoutRatio: 2330 115Q2 合併報表（只有 TTM 口徑）', async () => {
  const result = await calculateDividendPayoutRatio({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.payoutRatioTtm, 23.76);
  assert.equal(result.dividendsPaid.value, '-155595147');
  assert.equal(result.dividendsPaidTtm.value, '-531618438');
  assert.equal(result.netIncome.value, '706561938');
  assert.equal(result.netIncomeTtm.value, '2237087087');
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('dividendPayoutRatio: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateDividendPayoutRatio({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateDividendPayoutRatio({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.payoutRatioTtm, explicit.payoutRatioTtm);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('dividendPayoutRatio: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateDividendPayoutRatio({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.payoutRatioTtm, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
