import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBeneishMScore } from '@/domains/guru/beneishMScore/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 vs 114Q2（去年同季）合併報表實測值。
test('beneishMScore: 2330 115Q2 vs 114Q2，8 個變量全部能計算', async () => {
  const result = await calculateBeneishMScore({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

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
  // 不代表台積電真的有財報異常，見 src/domains/guru/README.md 的說明。
  assert.equal(result.flagged, true);

  assert.deepEqual(result.fieldStatuses, {});
  assert.deepEqual(result.warnings, []);
});

test('beneishMScore: 查無資料的公司回傳 mScore=null，8 個變量都是 no_data，不是拋錯', async () => {
  const result = await calculateBeneishMScore({ companyId: '1101', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.mScore, null);
  assert.equal(result.flagged, null);
  for (const key of ['dsri', 'gmi', 'aqi', 'sgi', 'depi', 'sgai', 'tata', 'lvgi'] as const) {
    assert.equal(result[key], null);
    assert.equal(result.fieldStatuses[key]?.status, 'no_data');
  }
  assert.equal(result.fieldStatuses.mScore?.status, 'no_data');
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('beneishMScore: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateBeneishMScore({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateBeneishMScore({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.mScore, explicit.mScore);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('beneishMScore: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateBeneishMScore({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.mScore, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
