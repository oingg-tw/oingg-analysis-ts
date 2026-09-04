import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNissimPenmanRnoa } from '@/domainBatch/metrics/guru/nissimPenmanRnoa/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domainBatch/metrics/guru/README.md「Nissim_Penman_RNOA 卡在哪裡」——2330（台積電）115Q2 合併報表實測值。
// reconstructedRoeTtmPct 應該接近（不必完全等於）actualRoeTtmPct——差異來自模型本身只把「營業 vs
// 融資」兩分，沒有拆出權益法投資收益等其他非營業項目，是刻意簡化，不是計算錯誤。
test('nissimPenmanRnoa: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateNissimPenmanRnoa({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.rnoaQuarterlyPct, 15.09);
  assert.equal(result.rnoaTtmPct, 50.2);
  assert.equal(result.flev, -0.3529);
  assert.equal(result.actualRoeQuarterlyPct, 10.98);
  assert.equal(result.actualRoeTtmPct, 34.78);
  assert.ok(result.reconstructedRoeTtmPct !== null);
  // 重組 ROE 應該落在實際 ROE 的合理範圍內（差距 <= 10 個百分點，不是完全相等）。
  assert.ok(
    Math.abs(result.reconstructedRoeTtmPct! - result.actualRoeTtmPct!) <= 10,
    `重組 TTM ROE（${result.reconstructedRoeTtmPct}）跟實際 TTM ROE（${result.actualRoeTtmPct}）差距過大`
  );
  assert.deepEqual(result.fieldStatuses, {});
  assert.deepEqual(result.warnings, []);
});

// year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('nissimPenmanRnoa: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateNissimPenmanRnoa({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateNissimPenmanRnoa({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.rnoaQuarterlyPct, explicit.rnoaQuarterlyPct);
});

// 關鍵案例：sources 跟 roe/roic 一樣是 ['balanceSheet', 'incomeStatement']，不寫死季度數字
// （mops 資料持續在補），改成直接拿 getLatestAvailableQuarter 對同一組 sources 現查現算的結果
// 當期望值，驗證的是交集邏輯本身，不是凍結某天的快照。
test('nissimPenmanRnoa: 自動抓最新一季應該取資產負債表/損益表都有資料的交集，不是任一張表自己的最新一季', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['balanceSheet', 'incomeStatement']);
  const auto = await calculateNissimPenmanRnoa({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季資產負債表跟損益表都有資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
  // 2887 是金控，operatingIncome 這類一般業科目結構性為 null 很常見（跟其他指標踩過的坑一樣），
  // NOPAT/RNOA 可能算不出來，但 actualRoeQuarterlyPct（引用 roe/，不依賴 operatingIncome）
  // 應該還是能正確反映該季有沒有資料，用來確認季度解析本身沒有錯，不受 NOPAT 是否為 null 影響。
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('nissimPenmanRnoa: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateNissimPenmanRnoa({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.rnoaQuarterlyPct, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
