import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteTurnoverRatioFamilyPit } from '@/pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第五批遷移（turnoverRatio 補完整：4 個周轉率 + DIO/DSO/DPO + CCC）——跟
// tests/domains/metrics/turnoverRatio.test.ts 的既有基準數字交叉驗證。

const METRIC_CODES = [
  'inventoryTurnover',
  'receivablesTurnover',
  'fixedAssetTurnover',
  'payablesTurnover',
  'inventoryDays',
  'receivablesDays',
  'payablesDays',
  'cashConversionCycle',
];

beforeAll(async () => {
  await Promise.all(METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
});

test('turnoverRatioFamilyPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  // 這支 compute 函式一次寫 20 個 (metric_code, basis) 組合（4 個周轉率 x 3 basis + 3 個
  // 天數指標 x 2 basis + CCC x 2 basis），每次 writeMetricValue 都是「先查後寫」兩次 DB
  // 往返，比其他單一 metric_code 的測試慢，預設 5 秒逾時不夠，拉長到 20 秒。
  await computeAndWriteTurnoverRatioFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (metricCode: string, basis: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode, periodType: basis, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const inventoryQ = await findLatest('inventoryTurnover', 'Q');
  const inventoryQAnn = await findLatest('inventoryTurnover', 'Q_ANN');
  const inventoryTtm = await findLatest('inventoryTurnover', 'TTM');
  assert.equal(Number(inventoryQ!.value), 1.06);
  assert.equal(Number(inventoryQAnn!.value), 4.24);
  assert.equal(Number(inventoryTtm!.value), 4.12);

  const receivablesQ = await findLatest('receivablesTurnover', 'Q');
  const receivablesQAnn = await findLatest('receivablesTurnover', 'Q_ANN');
  const receivablesTtm = await findLatest('receivablesTurnover', 'TTM');
  assert.equal(Number(receivablesQ!.value), 2.92);
  assert.equal(Number(receivablesQAnn!.value), 11.68);
  assert.equal(Number(receivablesTtm!.value), 10.19);

  const fixedAssetQ = await findLatest('fixedAssetTurnover', 'Q');
  const fixedAssetQAnn = await findLatest('fixedAssetTurnover', 'Q_ANN');
  const fixedAssetTtm = await findLatest('fixedAssetTurnover', 'TTM');
  assert.equal(Number(fixedAssetQ!.value), 0.3);
  assert.equal(Number(fixedAssetQAnn!.value), 1.2);
  assert.equal(Number(fixedAssetTtm!.value), 1.03);

  const payablesQ = await findLatest('payablesTurnover', 'Q');
  const payablesQAnn = await findLatest('payablesTurnover', 'Q_ANN');
  const payablesTtm = await findLatest('payablesTurnover', 'TTM');
  assert.equal(Number(payablesQ!.value), 3.77);
  assert.equal(Number(payablesQAnn!.value), 15.08);
  assert.equal(Number(payablesTtm!.value), 14.59);

  const dioQAnn = await findLatest('inventoryDays', 'Q_ANN');
  const dioTtm = await findLatest('inventoryDays', 'TTM');
  assert.equal(Number(dioQAnn!.value), 86.08);
  assert.equal(Number(dioTtm!.value), 88.59);

  const dsoQAnn = await findLatest('receivablesDays', 'Q_ANN');
  const dsoTtm = await findLatest('receivablesDays', 'TTM');
  assert.equal(Number(dsoQAnn!.value), 31.25);
  assert.equal(Number(dsoTtm!.value), 35.82);

  const dpoQAnn = await findLatest('payablesDays', 'Q_ANN');
  const dpoTtm = await findLatest('payablesDays', 'TTM');
  assert.equal(Number(dpoQAnn!.value), 24.2);
  assert.equal(Number(dpoTtm!.value), 25.02);

  const cccQAnn = await findLatest('cashConversionCycle', 'Q_ANN');
  const cccTtm = await findLatest('cashConversionCycle', 'TTM');
  assert.equal(Number(cccQAnn!.value), 93.13);
  assert.equal(Number(cccTtm!.value), 99.39);
}, 20000);

test('turnoverRatioFamilyPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteTurnoverRatioFamilyPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.inventoryTurnoverQ, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: METRIC_CODES } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
