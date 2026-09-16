import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeNcav } from '@/application/metrics/valuation/ncav/computeNcav';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('ncavPit');

// 第四批（guru 分類）遷移——純資產負債表時點快照。2026-09-10 改回公司總額（不除以
// 股數，跟 marketCap 比較用「總額 vs 總額」，見 ncavDefinition.ts 的說明），基準數字
// 換成公司總額，不再跟舊的每股版本交叉驗證。

test('ncavPit: 2330 115Q2 合併報表（只有 Q 口徑），跟既有基準數字交叉驗證', async () => {
  await replay.run(computeNcav)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await replay.findLatest({ symbol: '2330', metricCode: 'ncav', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 1664516996000);
  assert.equal(q!.nullReason, null);
});

test('ncavPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeNcav)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'ncav' });
  assert.equal(count, 0);
});

