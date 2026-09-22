import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeSgr } from '@/application/metrics/growth/sgr/computeSgr';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('sgrPit');

// 第三批遷移（sgr）——獨立重新計算 ROE TTM + 配息率 TTM（不依賴 roe/dividendPayoutRatio
// 這兩個 metric_code 已寫入的值），跟 tests/domains/metrics/sgr.test.ts 的既有基準數字
// 交叉驗證，能抓出「獨立重算」這條路徑本身的 bug。

test('sgrPit: 2330 115Q2 合併報表（只有 TTM 口徑），跟既有基準數字交叉驗證', async () => {
  await replay.run(computeSgr)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'sgr', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), 31.21); // 2026-09-22 內部 ROE 分母改 5 點平均權益（roe.TTM 34.78 → 40.94，配息率不變 → 26.52 → 31.21）
  assert.equal(ttm!.nullReason, null);
});

test('sgrPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeSgr)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'sgr' });
  assert.equal(count, 0);
});

