import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeDebtRatio } from '@/application/metrics/resilience/debtRatio/computeDebtRatio';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('debtRatioPit');

test('debtRatioPit: 2330 115Q2 合併報表，跟 debtRatio.test.ts 的既有基準數字交叉驗證', async () => {
  await replay.run(computeDebtRatio)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await replay.findLatest({ symbol: '2330', metricCode: 'debtRatio', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 30.94);
  assert.equal(q!.nullReason, null);
});

test('debtRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeDebtRatio)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'debtRatio' });
  assert.equal(count, 0);
});

