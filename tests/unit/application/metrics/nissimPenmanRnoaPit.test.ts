import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeNissimPenmanRnoa } from '@/application/metrics/profitability/nissimPenmanRnoa/computeNissimPenmanRnoa';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('nissimPenmanRnoaPit');

// 第四批（guru 分類）遷移——只遷移 RNOA 本身（NOPAT/NOA），不遷移
// FLEV/NBC/SPREAD/reconstructedRoe，跟 tests/domains/metrics/nissimPenmanRnoa.test.ts 的
// 既有基準數字交叉驗證。

test('nissimPenmanRnoaPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeNissimPenmanRnoa)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2330', metricCode: 'nissimPenmanRnoa', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const q = await replay.findLatest({ ...where, periodType: 'Q' });
  const ttm = await replay.findLatest({ ...where, periodType: 'TTM' });

  assert.ok(q, 'basis=Q 應該有寫入');
  assert.equal(Number(q!.value), 15.09);
  assert.ok(ttm, 'basis=TTM 應該有寫入');
  assert.equal(Number(ttm!.value), 50.2);
});

test('nissimPenmanRnoaPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeNissimPenmanRnoa)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'nissimPenmanRnoa' });
  assert.equal(count, 0);
});

