import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeAccrualsRatio } from '@/application/metrics/quality/accrualsRatio/computeAccrualsRatio';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('accrualsRatioPit');

// 第三批遷移（accrualsRatio）——跟 tests/domains/metrics/accrualsRatio.test.ts 的既有
// 基準數字交叉驗證。

test('accrualsRatioPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeAccrualsRatio)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    replay.findLatest({ symbol: '2330', metricCode: 'accrualsRatio', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q && ttm, '兩個 periodType 應該全部寫入 metric_values');
  assert.equal(Number(q!.value), 4.44);
  assert.equal(Number(ttm!.value), 11.5);
});

test('accrualsRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeAccrualsRatio)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'accrualsRatio' });
  assert.equal(count, 0);
});

