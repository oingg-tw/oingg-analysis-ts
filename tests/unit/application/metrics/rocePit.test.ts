import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeRoce } from '@/application/metrics/profitability/roce/computeRoce';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('rocePit');

test('rocePit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeRoce)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    replay.findLatest({ symbol: '2330', metricCode: 'roce', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q && ttm, '兩個 periodType 應該全部寫入');
  assert.equal(Number(q!.value), 11.97); // 2026-09-22 分母改平均（舊 11.51）
  assert.equal(Number(ttm!.value), 41.04); // 2026-09-22 分母改平均（舊 35.65）
});

test('rocePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeRoce)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'roce' });
  assert.equal(count, 0);
});

