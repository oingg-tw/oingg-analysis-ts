import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeCashToAssetsRatio } from '@/application/metrics/resilience/cashToAssetsRatio/computeCashToAssetsRatio';
import { computeEquityRatio } from '@/application/metrics/resilience/equityRatio/computeEquityRatio';
import { computeNonOperatingIncomeRatio } from '@/application/metrics/profitability/nonOperatingIncomeRatio/computeNonOperatingIncomeRatio';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('unlockedSingleQuarterMetricsPit');

// 「全市場六季財報深度解鎖的指標」批次——單季即可的三支獨立指標（不需要歷史深度，
// 純粹是先前沒做而已）。用 2330 真實資料驗證。

test('nonOperatingIncomeRatioPit: 2330 應該算出非 null 的 Q 值', async () => {
  const outcome = await replay.run(computeNonOperatingIncomeRatio)({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);
  const row = await replay.findLatest({ symbol: '2330', metricCode: 'nonOperatingIncomeRatio', periodType: 'Q' });
  assert.ok(row);
  assert.ok(row!.value !== null);
});

test('equityRatioPit: 2330 應該落在 0~100% 合理範圍內', async () => {
  const outcome = await replay.run(computeEquityRatio)({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);
  const row = await replay.findLatest({ symbol: '2330', metricCode: 'equityRatio', periodType: 'Q' });
  assert.ok(row);
  const value = Number(row!.value);
  assert.ok(value > 0 && value < 100, `equityRatio 應該落在合理的 0~100% 範圍內，實際是 ${value}`);
});

test('cashToAssetsRatioPit: 2330 應該落在 0~100% 合理範圍內', async () => {
  const outcome = await replay.run(computeCashToAssetsRatio)({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);
  const row = await replay.findLatest({ symbol: '2330', metricCode: 'cashToAssetsRatio', periodType: 'Q' });
  assert.ok(row);
  const value = Number(row!.value);
  assert.ok(value > 0 && value < 100, `cashToAssetsRatio 應該落在合理的 0~100% 範圍內，實際是 ${value}`);
});

test('9999（查無資料的公司）三支都應該優雅降級', async () => {
  const query = { symbol: '9999', dataType: '2' as const, subsidiaryCompanyId: '' };
  const [a, b, c] = await Promise.all([
    replay.run(computeNonOperatingIncomeRatio)(query),
    replay.run(computeEquityRatio)(query),
    replay.run(computeCashToAssetsRatio)(query),
  ]);
  assert.equal(a.rocYear, null);
  assert.equal(b.rocYear, null);
  assert.equal(c.rocYear, null);
});

