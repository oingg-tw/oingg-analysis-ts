import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateBeneishMScore } from '@/domainMetrics/beneishMScore';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 vs 114Q2（去年同季）合併報表實測值。
test('beneishMScore: 2330 115Q2 vs 114Q2，8 個變量全部能計算', async () => {
  const result = await calculateBeneishMScore({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.priorYear, '114');
  assert.equal(result.priorSeason, '2');
  assert.equal(result.priorReportDate, '2025-06-30');

  assert.equal(result.dsri, 1.3723);
  assert.equal(result.gmi, 0.8656);
  assert.equal(result.aqi, 1.0667);
  assert.equal(result.sgi, 1.3605);
  assert.equal(result.depi, 1.1939);
  assert.equal(result.sgai, 0.8176);
  assert.equal(result.tata, -0.0082);
  assert.equal(result.lvgi, 0.9072);

  assert.equal(result.mScore, -1.4827);
  // 台積電這一季 YoY 營收成長高達 36%（SGI=1.36），Beneish M-Score 對高成長公司有已知的偽陽性
  // 傾向（模型沒辦法區分「真的在造假」跟「正常的高速成長」），flagged=true 是預期中的模型限制，
  // 不代表台積電真的有財報異常。
  assert.equal(result.flagged, true);

  assert.deepEqual(result.warnings, []);
});

// 用 9999 這種不存在的公司代號（不是挑一家「目前剛好沒資料」的真實公司）——真實公司即使
// 現在沒資料，之後被回填（mops-ts 補資料是正常的資料庫演進）就會讓斷言過期，見 tests/README.md
// 「不要拿會隨資料庫累積而改變的狀態寫死成斷言」的教訓（2026-08-31 用 1101 115Q2 踩過一次：
// mops-ts 那陣子在做 reconciliation/backfill，補上了這一季的資料，斷言因此失敗）。
test('beneishMScore: 查無資料的公司回傳 mScore=null，8 個變量都是 no_data，不是拋錯', async () => {
  const result = await calculateBeneishMScore({ symbol: '9999', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.mScore, null);
  assert.equal(result.flagged, null);
  for (const key of ['dsri', 'gmi', 'aqi', 'sgi', 'depi', 'sgai', 'tata', 'lvgi'] as const) {
    assert.equal(result[key], null);
  }
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('beneishMScore: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateBeneishMScore({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateBeneishMScore({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.mScore, explicit.mScore);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('beneishMScore: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateBeneishMScore({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.mScore, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
