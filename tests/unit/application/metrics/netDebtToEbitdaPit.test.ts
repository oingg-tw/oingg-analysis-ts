import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeNetDebtToEbitda } from '@/application/metrics/resilience/netDebtToEbitda/computeNetDebtToEbitda';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('netDebtToEbitdaPit');

test('netDebtToEbitdaPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeNetDebtToEbitda)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'netDebtToEbitda', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(ttm, 'TTM 應該有寫入');
  assert.equal(Number(ttm!.value), -0.67);
});

test('netDebtToEbitdaPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeNetDebtToEbitda)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'netDebtToEbitda' });
  assert.equal(count, 0);
});

