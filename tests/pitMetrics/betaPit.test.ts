import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteBetaPit } from '@/pitMetrics/valuation/beta/computeBetaPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { DAILY_CADENCE_FISCAL_QUARTER } from '@/pitMetrics/metricValueWriter';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 獨立重新實作 src/domainMetrics/beta.ts 的 pitMetrics 版本，同一套公式跟降頻邏輯，
// 只是寫入形狀改成「一個 metricCode='beta'，三個 basis 值各自一列」。不釘死確切數值
// （股價/指數資料逐日更新，跟 tests/domains/metrics/beta.test.ts 同一個理由），只驗證
// 合理性跟結構。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.beta!);
});

test('betaPit: 2330 三個 basis 都應該算出合理範圍內的值，並正確寫入 metric_values', async () => {
  const outcome = await computeAndWriteBetaPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.tradeDate, null, '2330 應該要能找到重疊交易日當基準日');

  for (const basis of ['1Y_DAILY', '2Y_WEEKLY', '5Y_MONTHLY'] as const) {
    const row = await analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'beta', basis, fiscalQuarter: DAILY_CADENCE_FISCAL_QUARTER, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });
    assert.ok(row, `basis=${basis} 應該有寫入 metric_values`);
    assert.ok(row!.value !== null, `2330 資料量足夠，basis=${basis} 應該算得出 Beta`);
    const value = Number(row!.value);
    // Beta 沒有理論上限，但個股 Beta 落在 -5~5 之外基本上代表算法出錯。
    assert.ok(value > -5 && value < 5, `Beta 值 ${value}（${basis}）超出合理範圍`);
    assert.equal(row!.knowledgeDate.getTime(), row!.tradeDate?.getTime(), 'knowledgeDate 應該恆等於 tradeDate（逐日型指標沒有公告延遲）');
    assert.equal(row!.knowledgeDateIsFallback, false);
  }
});

test('betaPit: 重跑同一個基準日，去重邏輯應該讓第二次全部 skipped_unchanged', async () => {
  const query = { symbol: '2330', dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWriteBetaPit(query);
  const second = await computeAndWriteBetaPit(query);

  assert.deepEqual(second.beta1YDaily, { action: 'skipped_unchanged' });
  assert.deepEqual(second.beta2YWeekly, { action: 'skipped_unchanged' });
  assert.deepEqual(second.beta5YMonthly, { action: 'skipped_unchanged' });
});

test('betaPit: 9999（查無股價資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteBetaPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.tradeDate, null);
  assert.deepEqual(outcome.beta1YDaily, { action: 'skipped_no_trade_date' });
  assert.deepEqual(outcome.beta2YWeekly, { action: 'skipped_no_trade_date' });
  assert.deepEqual(outcome.beta5YMonthly, { action: 'skipped_no_trade_date' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'beta' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
