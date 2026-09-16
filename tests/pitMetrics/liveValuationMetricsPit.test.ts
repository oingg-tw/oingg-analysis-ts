import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteLiveGrahamNumberPit } from '@/domainPitMetrics/valuation/liveGrahamNumber/computeLiveGrahamNumberPit';
import { computeAndWriteLivePegRatioPit } from '@/domainPitMetrics/valuation/livePegRatio/computeLivePegRatioPit';
import { computeAndWriteLiveMarketCapPit } from '@/domainPitMetrics/valuation/liveMarketCap/computeLiveMarketCapPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// liveGrahamNumber/livePegRatio/liveMarketCap——grahamNumber/pegRatio/marketCap 的即時
// 版本，見各自 compute*Pit.ts 檔頭說明：基本面維持用最新已申報財報，股價改用當下最新
// 收盤價（getLatestDailyPrice），每個交易日更新，寫進獨立的 metric_daily_cadence_values
// （不是季報型的 metric_values），knowledgeDate 恆等於 tradeDate（逐日型沒有公告延遲）。

const METRIC_CODES = ['liveGrahamNumber', 'livePegRatio', 'liveMarketCap'];
const COORD = (symbol: string, metricCode: string) => ({
  symbol,
  metricCode,
  lookbackRange: 'N/A',
  samplingInterval: 'N/A',
  snapshotCadence: 'EOD',
  dataType: '2',
  subsidiaryCompanyId: '',
});

beforeAll(async () => {
  await Promise.all(METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
});

test('liveGrahamNumberPit: 2330 應該用最新收盤價算出跟季報型 grahamNumber 同一種形狀的結果，寫進 metric_daily_cadence_values', async () => {
  const outcome = await computeAndWriteLiveGrahamNumberPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.tradeDate, null);

  const row = await analysisPrisma.metricDailyCadenceValue.findFirst({
    where: COORD('2330', 'liveGrahamNumber'),
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(row, 'liveGrahamNumber 應該有寫入');
  assert.equal(row!.knowledgeDate.getTime(), row!.tradeDate.getTime(), 'knowledgeDate 應該恆等於 tradeDate（逐日型沒有公告延遲）');
  assert.equal(row!.knowledgeDateIsFallback, false);
  assert.ok(row!.value !== null, '2330 有完整基本面+股價資料，liveGrahamNumber 不應該是 null');
});

test('livePegRatioPit: 2330 應該用最新收盤價算出結果，寫進 metric_daily_cadence_values', async () => {
  const outcome = await computeAndWriteLivePegRatioPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.tradeDate, null);

  const row = await analysisPrisma.metricDailyCadenceValue.findFirst({
    where: COORD('2330', 'livePegRatio'),
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(row, 'livePegRatio 應該有寫入');
  assert.equal(row!.knowledgeDate.getTime(), row!.tradeDate.getTime());
});

test('liveMarketCapPit: 2330 應該用最新收盤價×最新股數算出市值，寫進 metric_daily_cadence_values', async () => {
  const outcome = await computeAndWriteLiveMarketCapPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.tradeDate, null);

  const row = await analysisPrisma.metricDailyCadenceValue.findFirst({
    where: COORD('2330', 'liveMarketCap'),
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(row, 'liveMarketCap 應該有寫入');
  assert.ok(Number(row!.value) > 0, '2330 市值應該是正數');
});

test('三支指標重跑同一天，去重邏輯應該讓第二次全部 skipped_unchanged', async () => {
  const query = { symbol: '2330', dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWriteLiveGrahamNumberPit(query);
  await computeAndWriteLivePegRatioPit(query);
  await computeAndWriteLiveMarketCapPit(query);

  const second = await Promise.all([
    computeAndWriteLiveGrahamNumberPit(query),
    computeAndWriteLivePegRatioPit(query),
    computeAndWriteLiveMarketCapPit(query),
  ]);

  assert.deepEqual(second[0].eod, { action: 'skipped_unchanged' });
  assert.deepEqual(second[1].eod, { action: 'skipped_unchanged' });
  assert.deepEqual(second[2].eod, { action: 'skipped_unchanged' });
});

test('9999（查無股價資料的公司）應該優雅降級，不寫入', async () => {
  const query = { symbol: '9999', dataType: '2' as const, subsidiaryCompanyId: '' };
  const [graham, peg, marketCap] = await Promise.all([
    computeAndWriteLiveGrahamNumberPit(query),
    computeAndWriteLivePegRatioPit(query),
    computeAndWriteLiveMarketCapPit(query),
  ]);

  assert.equal(graham.tradeDate, null);
  assert.deepEqual(graham.eod, { action: 'skipped_no_trade_date' });
  assert.equal(peg.tradeDate, null);
  assert.deepEqual(peg.eod, { action: 'skipped_no_trade_date' });
  assert.equal(marketCap.tradeDate, null);
  assert.deepEqual(marketCap.eod, { action: 'skipped_no_trade_date' });

  const count = await analysisPrisma.metricDailyCadenceValue.count({ where: { symbol: '9999', metricCode: { in: METRIC_CODES } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
