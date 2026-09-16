import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeTurnoverRatioFamily } from '@/application/metrics/efficiency/turnoverRatio/computeTurnoverRatioFamily';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('turnoverRatioFamilyPit');

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
  'operatingCycle',
  'netWorkingCapitalTurnover',
  'inventoryToRevenueRatio',
  'receivablesToRevenueRatio',
];

test('turnoverRatioFamilyPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  // 這支 compute 函式一次寫多個 (metric_code, periodType) 組合，每次 writeMetricValue 都是
  // 「先查後寫」兩次 DB 往返，比其他單一 metric_code 的測試慢，預設 5 秒逾時不夠，拉長到 20 秒。
  await replay.run(computeTurnoverRatioFamily)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (metricCode: string, periodType: string) =>
    replay.findLatest({ symbol: '2330', metricCode, periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const inventoryQ = await findLatest('inventoryTurnover', 'Q');
  const inventoryTtm = await findLatest('inventoryTurnover', 'TTM');
  assert.equal(Number(inventoryQ!.value), 1.06);
  assert.equal(Number(inventoryTtm!.value), 4.12);

  const receivablesQ = await findLatest('receivablesTurnover', 'Q');
  const receivablesTtm = await findLatest('receivablesTurnover', 'TTM');
  assert.equal(Number(receivablesQ!.value), 2.92);
  assert.equal(Number(receivablesTtm!.value), 10.19);

  const fixedAssetQ = await findLatest('fixedAssetTurnover', 'Q');
  const fixedAssetTtm = await findLatest('fixedAssetTurnover', 'TTM');
  assert.equal(Number(fixedAssetQ!.value), 0.3);
  assert.equal(Number(fixedAssetTtm!.value), 1.03);

  const payablesQ = await findLatest('payablesTurnover', 'Q');
  const payablesTtm = await findLatest('payablesTurnover', 'TTM');
  assert.equal(Number(payablesQ!.value), 3.77);
  assert.equal(Number(payablesTtm!.value), 14.59);

  const dioTtm = await findLatest('inventoryDays', 'TTM');
  assert.equal(Number(dioTtm!.value), 88.59);

  const dsoTtm = await findLatest('receivablesDays', 'TTM');
  assert.equal(Number(dsoTtm!.value), 35.82);

  const dpoTtm = await findLatest('payablesDays', 'TTM');
  assert.equal(Number(dpoTtm!.value), 25.02);

  const cccTtm = await findLatest('cashConversionCycle', 'TTM');
  assert.equal(Number(cccTtm!.value), 99.39);

  // 2026-09-11 新增（「全市場六季財報深度解鎖的指標」批次）——operatingCycle = DIO+DSO
  // （不扣 DPO），跟上面已驗證過的 dio/dso 數字直接加總對得上：TTM 88.59+35.82=124.41。
  const operatingCycleTtm = await findLatest('operatingCycle', 'TTM');
  assert.equal(Number(operatingCycleTtm!.value), 124.41);

  const netWorkingCapitalTurnoverTtm = await findLatest('netWorkingCapitalTurnover', 'TTM');
  const inventoryToRevenueRatioTtm = await findLatest('inventoryToRevenueRatio', 'TTM');
  const receivablesToRevenueRatioTtm = await findLatest('receivablesToRevenueRatio', 'TTM');
  assert.ok(netWorkingCapitalTurnoverTtm!.value !== null);
  assert.ok(inventoryToRevenueRatioTtm!.value !== null);
  assert.ok(receivablesToRevenueRatioTtm!.value !== null);
}, 20000);

test('turnoverRatioFamilyPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeTurnoverRatioFamily)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.inventoryTurnoverQ, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: { in: METRIC_CODES } });
  assert.equal(count, 0);
});

