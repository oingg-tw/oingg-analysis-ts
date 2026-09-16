import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeFcfYield } from '@/application/metrics/valuation/fcfYield/computeFcfYield';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('fcfYieldPit');

// 第三批遷移（fcfYield）——用到逐日更新的股價資料，數值每天在變，不釘死確切數字，只驗證
// 合理性，跟 tests/domains/metrics/fcfYield.test.ts 同一種測試風格。

test('fcfYieldPit: 2330 115Q2 合併報表，寫入的值應該落在合理區間', async () => {
  await replay.run(computeFcfYield)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'fcfYield', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values（2330 有股價覆蓋）');
  if (ttm!.value !== null) {
    const value = Number(ttm!.value);
    assert.ok(value > 0 && value < 100, `fcfYieldTtmPct=${value} 數量級異常`);
  }
});

test('fcfYieldPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeFcfYield)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'fcfYield' });
  assert.equal(count, 0);
});

