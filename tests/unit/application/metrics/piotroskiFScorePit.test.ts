import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computePiotroskiFScore } from '@/application/metrics/quality/piotroskiFScore/computePiotroskiFScore';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('piotroskiFScorePit');

// 第四批（guru 分類）遷移——本季 vs 去年同季 9 訊號比較，去年同季座標用
// getPastNQuarters({rocYear,season},5)[0]，跟 tests/domains/metrics/piotroskiFScore.test.ts
// 的既有基準數字交叉驗證。要查兩組季度各三張表，比單季查詢慢，延長逾時。

test(
  'piotroskiFScorePit: 2330 115Q2 合併報表（只有 Q 口徑），跟既有基準數字交叉驗證',
  async () => {
    await replay.run(computePiotroskiFScore)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

    const q = await replay.findLatest({ symbol: '2330', metricCode: 'piotroskiFScore', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

    assert.ok(q, 'basis=Q 應該有寫入 metric_values');
    assert.equal(Number(q!.value), 8);
    assert.equal(q!.nullReason, null);
  },
  20000
);

test('piotroskiFScorePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computePiotroskiFScore)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'piotroskiFScore' });
  assert.equal(count, 0);
});

