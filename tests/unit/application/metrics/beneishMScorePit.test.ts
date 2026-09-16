import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeBeneishMScore } from '@/application/metrics/quality/beneishMScore/computeBeneishMScore';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('beneishMScorePit');

// 第四批（guru 分類）遷移——本季 vs 去年同季 8 變量比較，跟
// tests/domains/metrics/beneishMScore.test.ts 的既有基準數字交叉驗證。要查兩組季度各
// 三張表，比單季查詢慢，延長逾時。

test(
  'beneishMScorePit: 2330 115Q2 合併報表（只有 Q 口徑），跟既有基準數字交叉驗證',
  async () => {
    await replay.run(computeBeneishMScore)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

    const q = await replay.findLatest({ symbol: '2330', metricCode: 'beneishMScore', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

    assert.ok(q, 'basis=Q 應該有寫入 metric_values');
    assert.equal(Number(q!.value), -1.4827);
    assert.equal(q!.nullReason, null);
  },
  20000
);

test('beneishMScorePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeBeneishMScore)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'beneishMScore' });
  assert.equal(count, 0);
});

