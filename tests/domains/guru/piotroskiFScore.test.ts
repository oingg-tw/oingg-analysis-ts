import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePiotroskiFScore } from '@/domains/guru/piotroskiFScore/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 vs 114Q2（去年同季）合併報表實測值。
test('piotroskiFScore: 2330 115Q2 vs 114Q2，9 項訊號全部能判斷，score=8', async () => {
  const result = await calculatePiotroskiFScore({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.priorYear, '114');
  assert.equal(result.priorSeason, '2');
  assert.equal(result.priorReportDate, '2025-06-30');

  assert.equal(result.signals.length, 9);
  assert.ok(result.signals.every((s) => s.passed !== null), '2330 資料齊全，9 項訊號都應該能判斷');

  assert.equal(result.score, 8);
  // 台積電這幾年持續舉債擴廠，長期負債比率上升是預期中的，是唯一沒過的訊號。
  assert.equal(result.signals.find((s) => s.key === 'leverageDecreased')?.passed, false);
  assert.equal(result.signals.find((s) => s.key === 'positiveRoa')?.passed, true);
  assert.equal(result.signals.find((s) => s.key === 'positiveCfo')?.passed, true);
  assert.equal(result.signals.find((s) => s.key === 'accrualQuality')?.passed, true);

  assert.deepEqual(result.fieldStatuses, {});
  assert.deepEqual(result.warnings, []);
});

test('piotroskiFScore: 查無資料的公司回傳 score=null，9 項訊號都是 no_data，不是拋錯', async () => {
  const result = await calculatePiotroskiFScore({ companyId: '1101', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.score, null);
  assert.ok(result.signals.every((s) => s.passed === null));
  assert.equal(Object.keys(result.fieldStatuses).length, 10); // 9 個訊號 + score 本身
  for (const signal of result.signals) {
    assert.equal(result.fieldStatuses[signal.key]?.status, 'no_data');
  }
  assert.equal(result.fieldStatuses.score?.status, 'no_data');
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
