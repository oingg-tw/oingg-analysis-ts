import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeEps } from '@/application/metrics/profitability/eps/computeEps';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('epsPit');

// 第三批遷移（eps）——跟 tests/domains/metrics/eps.test.ts 的既有基準數字交叉驗證。

test('epsPit: 2330 115Q2 合併報表，跟 eps.test.ts 的既有基準數字交叉驗證', async () => {
  await replay.run(computeEps)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    replay.findLatest({ symbol: '2330', metricCode: 'eps', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q && ttm, '兩個 periodType 應該全部寫入 metric_values');
  assert.equal(Number(q!.value), 27.25);
  assert.equal(Number(ttm!.value), 86.27);
  assert.equal(q!.nullReason, null);
});

test('epsPit: 9999（查無資料的公司）應該優雅降級，都不寫入', async () => {
  const outcome = await replay.run(computeEps)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'eps' });
  assert.equal(count, 0);
});

