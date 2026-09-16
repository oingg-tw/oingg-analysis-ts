import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeRevenuePerShare } from '@/application/metrics/profitability/revenuePerShare/computeRevenuePerShare';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('revenuePerSharePit');

// 第三批遷移（revenuePerShare）——跟 tests/domains/metrics/revenuePerShare.test.ts 的既有
// 基準數字交叉驗證。

test('revenuePerSharePit: 2330 115Q2 合併報表，跟 revenuePerShare.test.ts 的既有基準數字交叉驗證', async () => {
  await replay.run(computeRevenuePerShare)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    replay.findLatest({ symbol: '2330', metricCode: 'revenuePerShare', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q && ttm, '兩個 periodType 應該全部寫入 metric_values');
  assert.equal(Number(q!.value), 48.99);
  assert.equal(Number(ttm!.value), 171.23);
});

test('revenuePerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeRevenuePerShare)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'revenuePerShare' });
  assert.equal(count, 0);
});

