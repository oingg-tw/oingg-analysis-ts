import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computePFcf } from '@/application/metrics/valuation/pFcf/computePFcf';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('pFcfPit');

// P_FCF 用到逐日更新的市值資料，數值每天在變，不釘死確切數字，只驗證合理性。

test('pFcfPit: 2330 115Q2 合併報表，寫入的值應該落在合理區間', async () => {
  await replay.run(computePFcf)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'pFcf', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(ttm, 'basis=TTM 應該有寫入（2330 自由現金流通常為正，有市值覆蓋）');
  if (ttm!.value !== null) {
    const value = Number(ttm!.value);
    assert.ok(value > 0 && value < 1000, `pFcfTtm=${value} 數量級異常`);
  }
});

test('pFcfPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computePFcf)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'pFcf' });
  assert.equal(count, 0);
});

