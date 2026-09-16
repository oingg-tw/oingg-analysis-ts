import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeCapexToRevenue } from '@/application/metrics/efficiency/capexToRevenue/computeCapexToRevenue';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('capexToRevenuePit');

test('capexToRevenuePit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeCapexToRevenue)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await replay.findLatest({ symbol: '2330', metricCode: 'capexToRevenue', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'capexToRevenue', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(q && ttm, 'Q/TTM 應該都寫入');
  assert.equal(Number(q!.value), 39.04);
  assert.equal(Number(ttm!.value), 33.58);
});

test('capexToRevenuePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeCapexToRevenue)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'capexToRevenue' });
  assert.equal(count, 0);
});

