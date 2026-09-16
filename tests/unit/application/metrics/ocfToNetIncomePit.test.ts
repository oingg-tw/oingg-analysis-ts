import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeOcfToNetIncome } from '@/application/metrics/quality/ocfToNetIncome/computeOcfToNetIncome';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('ocfToNetIncomePit');

// 第三批遷移（ocfToNetIncome）——跟 tests/domains/metrics/ocfToNetIncome.test.ts 的既有
// 基準數字交叉驗證。

test('ocfToNetIncomePit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeOcfToNetIncome)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await replay.findLatest({ symbol: '2330', metricCode: 'ocfToNetIncome', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'ocfToNetIncome', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(q && ttm, 'Q/TTM 應該都寫入 metric_values');
  assert.equal(Number(q!.value), 1.11);
  assert.equal(Number(ttm!.value), 1.18);
});

test('ocfToNetIncomePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeOcfToNetIncome)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'ocfToNetIncome' });
  assert.equal(count, 0);
});

