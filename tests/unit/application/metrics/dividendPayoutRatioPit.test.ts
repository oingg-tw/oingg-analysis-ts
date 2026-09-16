import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeDividendPayoutRatio } from '@/application/metrics/dividend/dividendPayoutRatio/computeDividendPayoutRatio';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('dividendPayoutRatioPit');

// 第三批遷移（dividendPayoutRatio）——跟 tests/domains/metrics/dividendPayoutRatio.test.ts
// 的既有基準數字交叉驗證。

test('dividendPayoutRatioPit: 2330 115Q2 合併報表（只有 TTM 口徑），跟既有基準數字交叉驗證', async () => {
  await replay.run(computeDividendPayoutRatio)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'dividendPayoutRatio', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), 23.76);
  assert.equal(ttm!.nullReason, null);
});

test('dividendPayoutRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeDividendPayoutRatio)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'dividendPayoutRatio' });
  assert.equal(count, 0);
});

