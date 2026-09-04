import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOwnerEarnings } from '@/domainBatch/metrics/guru/ownerEarnings/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domainApi/metrics/guru/README.md「Buffett_Owner_Earnings（股東盈餘）計算口徑」——
// 2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：見 ocfToNetIncome.test.ts 開頭註解，mops 現金流量表修正後折舊/攤銷/資本支出
// 本季數字都變了（paidInShares 來自 capital_stock_history，不受這次修正影響，數字不變）。
test('ownerEarnings: 2330 115Q2 合併報表（每股版本）', async () => {
  const result = await calculateOwnerEarnings({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.ownerEarningsPerShareQuarterly, 15.78);
  assert.equal(result.ownerEarningsPerShareQuarterlyAnnualized, 63.12);
  assert.equal(result.ownerEarningsPerShareTtm, 55.33);
  assert.equal(result.netIncome.value, '706561938');
  assert.equal(result.depreciationAndAmortization.value, '198538168');
  assert.equal(result.capitalExpenditures.value, '-496001947');
  assert.equal(result.paidInShares.value, '25932370067');
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('ownerEarnings: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateOwnerEarnings({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateOwnerEarnings({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.ownerEarningsPerShareQuarterly, explicit.ownerEarningsPerShareQuarterly);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('ownerEarnings: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateOwnerEarnings({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.ownerEarningsPerShareQuarterly, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
