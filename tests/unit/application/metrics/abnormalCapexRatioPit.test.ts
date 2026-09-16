import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeAbnormalCapexRatio } from '@/application/metrics/quality/abnormalCapexRatio/computeAbnormalCapexRatio';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('abnormalCapexRatioPit');

test('abnormalCapexRatioPit: 2330 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeAbnormalCapexRatio)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const fy = await replay.findLatest({ symbol: '2330', metricCode: 'abnormalCapexRatio', periodType: 'FY', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(fy, 'FY 應該寫入');
  assert.equal(Number(fy!.value), 27.73);
});

test('abnormalCapexRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeAbnormalCapexRatio)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.fy, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'abnormalCapexRatio' });
  assert.equal(count, 0);
});

