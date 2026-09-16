import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computePegRatio } from '@/application/metrics/valuation/pegRatio/computePegRatio';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('pegRatioPit');

test('pegRatioPit: 2330 115Q2，跟 peRatio.TTM ÷ epsCagr5y 交叉驗證', async () => {
  await replay.run(computePegRatio)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'pegRatio', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(ttm, 'basis=TTM 應該有寫入');
  assert.equal(Number(ttm!.value), 1.02, '27.76 (peRatio.TTM) / 27.1 (epsCagr5y) = 1.02');
  assert.equal(ttm!.nullReason, null);
});

test('pegRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computePegRatio)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'pegRatio' });
  assert.equal(count, 0);
});

