import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeOneilCanslimScore } from '@/application/metrics/growth/oneilCanslimScore/computeOneilCanslimScore';
import { computeEpsGrowthRate } from '@/application/metrics/growth/epsGrowthRate/computeEpsGrowthRate';
import { computeRevenueGrowthRate } from '@/application/metrics/growth/revenueGrowthRate/computeRevenueGrowthRate';
import { computeEpsCagrFamily } from '@/application/metrics/growth/epsCagr/computeEpsCagrFamily';
import { computeRoe } from '@/application/metrics/profitability/roe/computeRoe';
import { CANSLIM_THRESHOLDS } from '@/application/metrics/growth/oneilCanslimScore/computeOneilCanslimScore';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('oneilCanslimScorePit');

// 2026-09-20 O'Neil CAN SLIM 複合指標——不釘死 2330 的分數是幾分（四支子指標的數字會隨上游重編
// 變動，見 tests/README.md 的原則），改成「分數必須等於四支子指標各自對門檻判定後的加總」：這才是
// 這支 compute 真正的契約（復用子指標、不重寫公式、座標對齊同一季），子指標的真實數字各自由它們
// 的 cassette 守著。2330 是目前唯一有完整多年歷史、epsCagr3y 算得出來的公司，所以只有它能拿到
// 非 null 的分數。

const at = (metricCode: string, periodType: 'Q' | 'TTM' | 'FY') => ({ symbol: '2330', metricCode, periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

test(
  'oneilCanslimScorePit: 2330 115Q2 的分數 = 四支子指標各自過門檻的數量，座標同一季',
  async () => {
    await replay.run(computeOneilCanslimScore)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeEpsGrowthRate)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeRevenueGrowthRate)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.runNested(computeEpsCagrFamily, 'results')({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeRoe)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

    const score = await replay.findLatest(at('oneilCanslimScore', 'Q'));
    assert.ok(score, 'oneilCanslimScore.Q 應該有寫入');

    const inputs = await Promise.all([
      replay.findLatest(at('epsGrowthRate', 'Q')),
      replay.findLatest(at('revenueGrowthRate', 'Q')),
      replay.findLatest(at('epsCagr3y', 'FY')),
      replay.findLatest(at('roe', 'TTM')),
    ]);
    const mins = [CANSLIM_THRESHOLDS.epsGrowthRateMin, CANSLIM_THRESHOLDS.revenueGrowthRateMin, CANSLIM_THRESHOLDS.epsCagr3yMin, CANSLIM_THRESHOLDS.roeMin];

    for (const row of inputs) assert.ok(row && row.value !== null, '2330 四支子指標在 115Q2 都應該有值（有完整歷史）');
    const expected = inputs.reduce((sum, row, i) => sum + (Number(row!.value) >= mins[i]! ? 1 : 0), 0);

    assert.equal(score!.nullReason, null);
    assert.equal(Number(score!.value), expected);
    assert.ok(Number(score!.value) >= 0 && Number(score!.value) <= 4);
  },
  30000
);

test('oneilCanslimScorePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeOneilCanslimScore)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'oneilCanslimScore' });
  assert.equal(count, 0);
});
