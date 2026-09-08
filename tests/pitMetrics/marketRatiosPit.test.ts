import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteMarketRatiosPit } from '@/pitMetrics/shared/marketRatios/computeMarketRatiosPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { DAILY_CADENCE_FISCAL_QUARTER } from '@/pitMetrics/metricValueWriter';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// MarketRatios 遷入 pitMetrics 的第一批真正的 compute 檔案（前提條件都已經在別的批次
// 鋪好）：直接 passthrough TWSE/TPEx 官方每日公布數字，不自己重算，見
// computeMarketRatiosPit.ts 檔頭說明。用 2330 真實資料驗證。

beforeAll(async () => {
  await Promise.all(
    ['exchangePeRatio', 'exchangePbRatio', 'dividendYield'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!))
  );
});

test('marketRatiosPit: 2330 應該把 daily_valuation 的三個欄位原封不動寫進 metric_values', async () => {
  const outcome = await computeAndWriteMarketRatiosPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.tradeDate, null);

  const [pe, pb, dy] = await Promise.all(
    ['exchangePeRatio', 'exchangePbRatio', 'dividendYield'].map((metricCode) =>
      analysisPrisma.metricValue.findFirst({
        where: { symbol: '2330', metricCode, basis: 'DAILY', fiscalQuarter: DAILY_CADENCE_FISCAL_QUARTER, dataType: '2', subsidiaryCompanyId: '' },
        orderBy: { knowledgeDate: 'desc' },
      })
    )
  );

  assert.ok(pe, 'exchangePeRatio 應該有寫入');
  assert.ok(pb, 'exchangePbRatio 應該有寫入');
  assert.ok(dy, 'dividendYield 應該有寫入');

  // knowledgeDate 應該恆等於 tradeDate（逐日型指標沒有公告延遲），tradeDate 欄位本身
  // 也要正確填上（不是純資訊性欄位留空）。
  assert.equal(pe!.knowledgeDate.getTime(), pe!.tradeDate?.getTime());
  assert.equal(pe!.knowledgeDateIsFallback, false);
  assert.notEqual(pe!.tradeDate, null);

  // fiscalYear 應該是交易日的西元年（不是隨便填當前年份），三個 metricCode 都用同一個
  // tradeDate，fiscalYear 應該完全一致。
  assert.equal(pe!.fiscalYear, pb!.fiscalYear);
  assert.equal(pe!.fiscalYear, dy!.fiscalYear);
});

test('marketRatiosPit: 重跑同一天，去重邏輯應該讓第二次全部 skipped_unchanged', async () => {
  const query = { symbol: '2330', dataType: '2' as const, subsidiaryCompanyId: '' };
  const first = await computeAndWriteMarketRatiosPit(query);
  const second = await computeAndWriteMarketRatiosPit(query);

  assert.deepEqual(second.exchangePeRatio, { action: 'skipped_unchanged' });
  assert.deepEqual(second.exchangePbRatio, { action: 'skipped_unchanged' });
  assert.deepEqual(second.dividendYield, { action: 'skipped_unchanged' });
  assert.equal(first.tradeDate, second.tradeDate);
});

test('marketRatiosPit: 9999（查無 daily_valuation 資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteMarketRatiosPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.tradeDate, null);
  assert.deepEqual(outcome.exchangePeRatio, { action: 'skipped_no_trade_date' });
  assert.deepEqual(outcome.exchangePbRatio, { action: 'skipped_no_trade_date' });
  assert.deepEqual(outcome.dividendYield, { action: 'skipped_no_trade_date' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: ['exchangePeRatio', 'exchangePbRatio', 'dividendYield'] } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
