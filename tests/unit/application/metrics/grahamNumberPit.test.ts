import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeGrahamNumber } from '@/application/metrics/valuation/grahamNumber/computeGrahamNumber';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('grahamNumberPit');

// 第四批（guru 分類）遷移——獨立重新計算 EPS(TTM)/BVPS（不依賴 eps/bvps 這兩個
// metric_code 已寫入的值）。2026-09-10 公式改成 PER(TTM) × PBR（不再是
// sqrt(22.5×EPS×BVPS)，理由見 computeGrahamNumberPit.ts 的說明），基準數字換成跟
// peRatio.TTM × pbRatio.Q 交叉驗證（27.76 × 9.66 = 268.16）。

test('grahamNumberPit: 2330 115Q2 合併報表（只有 TTM 口徑），跟 peRatio×pbRatio 交叉驗證', async () => {
  await replay.run(computeGrahamNumber)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'grahamNumber', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  // 2026-09-22 v2：PER/PBR 中繼值不再各自四捨五入，只在最後一次 → 268.16（兩個進位值相乘）變 268.06。
  assert.equal(Number(ttm!.value), 268.06);
  assert.equal(ttm!.formulaVersion, 2);
  assert.equal(ttm!.nullReason, null);
});

test('grahamNumberPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeGrahamNumber)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'grahamNumber' });
  assert.equal(count, 0);
});

