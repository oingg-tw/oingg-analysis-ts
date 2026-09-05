import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateOhlsonOScore } from '@/domainMetrics/ohlsonOScore/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domainMetrics/guru.md「Ohlson O-Score 計算口徑」——2330（台積電）115Q2 合併報表實測值。
test('ohlsonOScore: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateOhlsonOScore({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.tlta, 0.3094);
  assert.equal(result.wcta, 0.2888);
  assert.equal(result.clca, 0.4069);
  assert.equal(result.oeneg, 0);
  assert.equal(result.nita, 0.2386);
  assert.equal(result.intwo, 0);
  assert.ok(result.oScore !== null && result.oScore < 0, 'TSMC 財務體質極佳，O-Score 應該是負值（低破產風險）');
  assert.ok(result.probabilityOfBankruptcy !== null && result.probabilityOfBankruptcy < 0.01, '財務危機機率應該極低');
  assert.equal(result.flagged, false);
  assert.deepEqual(result.fieldStatuses, {});
  assert.deepEqual(result.warnings, []);
});

test('ohlsonOScore: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateOhlsonOScore({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateOhlsonOScore({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.oScore, explicit.oScore);
});

test('ohlsonOScore: 自動抓最新一季應該取資產負債表/損益表/現金流量表都有資料的交集，不是任一張表自己的最新一季', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
  const auto = await calculateOhlsonOScore({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季三張表都有資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
});

// 2887 是金控，資產負債表不按流動/非流動分類（currentAssets/currentLiabilities 結構性為 null），
// WCTA/CLCA 應該是 null，導致整體 oScore 也是 null（優雅降級），但不依賴流動資產/負債的變數
// （SIZE/TLTA/OENEG/NITA/FUTL/INTWO/CHIN）應該照常算得出來，不會被拖累。
test('ohlsonOScore: 2887（金控，流動資產/負債結構性為 null）WCTA/CLCA/oScore 應該優雅降級成 null，其餘變數不受影響', async () => {
  const result = await calculateOhlsonOScore({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.wcta, null);
  assert.equal(result.clca, null);
  assert.equal(result.oScore, null);
  assert.equal(result.fieldStatuses.oScore?.status, 'no_data');
  assert.ok(result.size !== null, 'SIZE 不依賴流動資產/負債，應該照常算得出來');
  assert.ok(result.tlta !== null, 'TLTA 不依賴流動資產/負債，應該照常算得出來');
});

test('ohlsonOScore: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateOhlsonOScore({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.oScore, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
