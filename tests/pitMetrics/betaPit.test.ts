import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteBetaPit } from '@/domainPitMetrics/valuation/beta/computeBetaPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import type { LookbackRange, SamplingInterval } from '@/domainPitMetrics/metricBasis';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 獨立重新實作 src/domainMetrics/beta.ts 的 pitMetrics 版本，同一套公式跟降頻邏輯，
// 只是寫入形狀改成「一個 metricCode='beta'，三個 (lookbackRange, samplingInterval)
// 組合各自一列」。不釘死確切數值（股價/指數資料逐日更新，跟
// tests/domains/metrics/beta.test.ts 同一個理由），只驗證合理性跟結構。
//
// 2026-09-09：Beta 拆表後寫進獨立的 metric_daily_cadence_values（不再是
// analysisPrisma.metricValue），tradeDate 是真正的自然鍵，不再需要
// fiscalQuarter=DAILY_CADENCE_FISCAL_QUARTER 這種 sentinel。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.beta!);
});

test('betaPit: 2330 四個窗口都應該算出合理範圍內的值，並正確寫入 metric_daily_cadence_values', async () => {
  const outcome = await computeAndWriteBetaPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.tradeDate, null, '2330 應該要能找到重疊交易日當基準日');

  for (const [lookbackRange, samplingInterval] of [
    ['1Y', '1D'],
    ['2Y', '1W'],
    ['3Y', '1W'],
    ['5Y', '1M'],
  ] as [LookbackRange, SamplingInterval][]) {
    const window = `${lookbackRange}_${samplingInterval}`; // 只是給斷言訊息用的顯示字串
    const row = await analysisPrisma.metricDailyCadenceValue.findFirst({
      where: { symbol: '2330', metricCode: 'beta', lookbackRange, samplingInterval, snapshotCadence: 'N/A', dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });
    assert.ok(row, `window=${window} 應該有寫入 metric_daily_cadence_values`);
    assert.ok(row!.value !== null, `2330 資料量足夠，window=${window} 應該算得出 Beta`);
    const value = Number(row!.value);
    // Beta 沒有理論上限，但個股 Beta 落在 -5~5 之外基本上代表算法出錯。
    assert.ok(value > -5 && value < 5, `Beta 值 ${value}（${window}）超出合理範圍`);
    assert.equal(row!.knowledgeDate.getTime(), row!.tradeDate.getTime(), 'knowledgeDate 應該恆等於 tradeDate（逐日型指標沒有公告延遲）');
    assert.equal(row!.knowledgeDateIsFallback, false);
  }
});

test('betaPit: 重跑同一個基準日，去重邏輯應該讓第二次全部 skipped_unchanged', async () => {
  const query = { symbol: '2330', dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWriteBetaPit(query);
  const second = await computeAndWriteBetaPit(query);

  assert.deepEqual(second.beta1YDaily, { action: 'skipped_unchanged' });
  assert.deepEqual(second.beta2YWeekly, { action: 'skipped_unchanged' });
  assert.deepEqual(second.beta3YWeekly, { action: 'skipped_unchanged' });
  assert.deepEqual(second.beta5YMonthly, { action: 'skipped_unchanged' });
});

test('betaPit: 9999（查無股價資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteBetaPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.tradeDate, null);
  assert.deepEqual(outcome.beta1YDaily, { action: 'skipped_no_trade_date' });
  assert.deepEqual(outcome.beta2YWeekly, { action: 'skipped_no_trade_date' });
  assert.deepEqual(outcome.beta3YWeekly, { action: 'skipped_no_trade_date' });
  assert.deepEqual(outcome.beta5YMonthly, { action: 'skipped_no_trade_date' });

  const count = await analysisPrisma.metricDailyCadenceValue.count({ where: { symbol: '9999', metricCode: 'beta' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
