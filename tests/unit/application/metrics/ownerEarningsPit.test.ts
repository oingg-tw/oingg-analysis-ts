import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeOwnerEarnings } from '@/application/metrics/quality/ownerEarnings/computeOwnerEarnings';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('ownerEarningsPit');

// 第四批（guru 分類）遷移——股東盈餘（淨利+折舊攤銷+資本支出）/流通股數，跟
// tests/domains/metrics/ownerEarnings.test.ts 的既有基準數字交叉驗證，Q/TTM 兩個
// basis 都有。

test('ownerEarningsPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await replay.run(computeOwnerEarnings)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2330', metricCode: 'ownerEarnings', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const q = await replay.findLatest({ ...where, periodType: 'Q' });
  const ttm = await replay.findLatest({ ...where, periodType: 'TTM' });

  assert.ok(q, 'basis=Q 應該有寫入');
  assert.equal(Number(q!.value), 15.78);
  assert.ok(ttm, 'basis=TTM 應該有寫入');
  assert.equal(Number(ttm!.value), 55.33);
});

test('ownerEarningsPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeOwnerEarnings)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'ownerEarnings' });
  assert.equal(count, 0);
});

