import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeEps } from '@/application/metrics/profitability/eps/computeEps';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('epsPit');

// 第三批遷移（eps）——跟 tests/domains/metrics/eps.test.ts 的既有基準數字交叉驗證。

test('epsPit: 2330 115Q2 合併報表，跟 eps.test.ts 的既有基準數字交叉驗證', async () => {
  await replay.run(computeEps)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    replay.findLatest({ symbol: '2330', metricCode: 'eps', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q && ttm, '兩個 periodType 應該全部寫入 metric_values');
  assert.equal(Number(q!.value), 27.25);
  assert.equal(Number(ttm!.value), 86.27);
  assert.equal(q!.nullReason, null);
});

// FY 是年報公告的 EPS（全年加權平均股數），不是四季相加。2454 113 年刻意選兩者不同的案例：
// 年報 66.92、我們期末股本口徑的近四季 66.42——FY 若退化成四季相加，這支會抓到。
test('epsPit: FY 讀年報 EPS，不是四季相加（2454 113 年）', async () => {
  await replay.run(computeEps)({ symbol: '2454', year: '114', season: '1', dataType: '2', subsidiaryCompanyId: '' });

  const fy = await replay.findLatest({ symbol: '2454', metricCode: 'eps', periodType: 'FY', fiscalYear: 2024, fiscalQuarter: 4, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(fy, '第一季的計算要順便寫上一個完整年度的 FY');
  assert.equal(Number(fy!.value), 66.92);
  assert.equal(fy!.nullReason, null);

  await replay.run(computeEps)({ symbol: '2454', year: '113', season: '4', dataType: '2', subsidiaryCompanyId: '' });
  const ttmAtQ4 = await replay.findLatest({ symbol: '2454', metricCode: 'eps', periodType: 'TTM', fiscalYear: 2024, fiscalQuarter: 4, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(Number(ttmAtQ4!.value), 66.42, '對照組：同一年度的近四季（期末股本）');
});

test('epsPit: 9999（查無資料的公司）應該優雅降級，都不寫入', async () => {
  const outcome = await replay.run(computeEps)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.fy, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'eps' });
  assert.equal(count, 0);
});

