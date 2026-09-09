import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteDupontFamilyPit } from '@/domainPitMetrics/shared/dupont/computeDupontFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第二批遷移（Dupont 拆解家族）——src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts 是
// src/domainMetrics/margins.ts（僅 netProfitMargin）/turnoverRatio.ts（僅 assetTurnover）/
// dupont.ts 三支舊架構檔案的獨立重新實作，這裡拿 tests/domains/metrics/dupont.test.ts 裡
// 2330 115Q2 的既有基準數字交叉驗證，測試結構比照 tests/domainPitMetrics/roePit.test.ts。

const findLatest = (symbol: string, metricCode: string, periodType: string, fiscalYear: number, fiscalQuarter: number) =>
  analysisPrisma.metricValue.findFirst({
    where: { symbol, metricCode, periodType, fiscalYear, fiscalQuarter, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

beforeAll(async () => {
  await Promise.all([
    upsertMetricDefinition(metricDefinitionRegistry.netProfitMargin!),
    upsertMetricDefinition(metricDefinitionRegistry.assetTurnover!),
    upsertMetricDefinition(metricDefinitionRegistry.equityMultiplier!),
    upsertMetricDefinition(metricDefinitionRegistry.dupontDecomposedRoe!),
    upsertMetricDefinition(metricDefinitionRegistry.dupontTaxBurden!),
    upsertMetricDefinition(metricDefinitionRegistry.dupontInterestBurden!),
    upsertMetricDefinition(metricDefinitionRegistry.dupontEbitMargin!),
    upsertMetricDefinition(metricDefinitionRegistry.dupontExtendedRoe!),
  ]);
});

test('dupontFamilyPit: 2330 115Q2 合併報表，跟 dupont.test.ts 的既有基準數字交叉驗證', async () => {
  await computeAndWriteDupontFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const netProfitMarginQ = await findLatest('2330', 'netProfitMargin', 'Q', 2026, 2);
  const netProfitMarginTtm = await findLatest('2330', 'netProfitMargin', 'TTM', 2026, 2);
  const assetTurnoverQ = await findLatest('2330', 'assetTurnover', 'Q', 2026, 2);
  const assetTurnoverQAnn = await findLatest('2330', 'assetTurnover', 'Q_ANN', 2026, 2);
  const assetTurnoverTtm = await findLatest('2330', 'assetTurnover', 'TTM', 2026, 2);
  const equityMultiplier = await findLatest('2330', 'equityMultiplier', 'Q', 2026, 2);
  const decomposedRoeQ = await findLatest('2330', 'dupontDecomposedRoe', 'Q', 2026, 2);
  const decomposedRoeTtm = await findLatest('2330', 'dupontDecomposedRoe', 'TTM', 2026, 2);

  assert.ok(netProfitMarginQ && netProfitMarginTtm && assetTurnoverQ && assetTurnoverQAnn && assetTurnoverTtm && equityMultiplier && decomposedRoeQ && decomposedRoeTtm, '5 個 metric_code 應該全部寫入 metric_values');

  assert.equal(Number(netProfitMarginQ!.value), 55.62);
  assert.equal(Number(netProfitMarginTtm!.value), 50.38);
  assert.equal(Number(assetTurnoverQ!.value), 0.14);
  assert.equal(Number(assetTurnoverQAnn!.value), 0.56);
  assert.equal(Number(assetTurnoverTtm!.value), 0.47);
  assert.equal(Number(equityMultiplier!.value), 1.46);
  assert.equal(Number(decomposedRoeQ!.value), 11.37);
  assert.equal(Number(decomposedRoeTtm!.value), 34.57);
  assert.equal(decomposedRoeQ!.nullReason, null);
  assert.equal(decomposedRoeTtm!.nullReason, null);
  assert.equal(netProfitMarginQ!.knowledgeDateIsFallback, false);
});

// 五因子 Extended DuPont（2026-09-07 新增）：把上面的 netProfitMargin 再拆成稅務負擔×
// 利息負擔×EBIT利潤率。用 2330 115Q2 真實 XBRL 資料手動核算過（netIncome=706561938、
// preTax=862430086、financeCosts=3085049、revenue=1270380250），五因子相乘的結果
// 精確等於既有 dupontDecomposedRoe 的基準值（11.37/34.57）——這是驗證這批新公式本身
// 沒有算錯的關鍵交叉點：如果五因子相乘公式（尤其是 *100 尺度校正那段）寫錯，這裡會
// 對不上，不會是巧合。
test('dupontFamilyPit: 五因子 Extended DuPont（2330 115Q2）應該精確等於既有三因子 dupontDecomposedRoe', async () => {
  await computeAndWriteDupontFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const taxBurdenQ = await findLatest('2330', 'dupontTaxBurden', 'Q', 2026, 2);
  const interestBurdenQ = await findLatest('2330', 'dupontInterestBurden', 'Q', 2026, 2);
  const ebitMarginQ = await findLatest('2330', 'dupontEbitMargin', 'Q', 2026, 2);
  const extendedRoeQ = await findLatest('2330', 'dupontExtendedRoe', 'Q', 2026, 2);
  const taxBurdenTtm = await findLatest('2330', 'dupontTaxBurden', 'TTM', 2026, 2);
  const interestBurdenTtm = await findLatest('2330', 'dupontInterestBurden', 'TTM', 2026, 2);
  const ebitMarginTtm = await findLatest('2330', 'dupontEbitMargin', 'TTM', 2026, 2);
  const extendedRoeTtm = await findLatest('2330', 'dupontExtendedRoe', 'TTM', 2026, 2);

  assert.ok(
    taxBurdenQ && interestBurdenQ && ebitMarginQ && extendedRoeQ && taxBurdenTtm && interestBurdenTtm && ebitMarginTtm && extendedRoeTtm,
    '8 個新 metric_code/periodType 組合應該全部寫入 metric_values'
  );

  assert.equal(Number(taxBurdenQ!.value), 81.93);
  assert.equal(Number(interestBurdenQ!.value), 99.64);
  assert.equal(Number(ebitMarginQ!.value), 68.13);
  assert.equal(Number(extendedRoeQ!.value), 11.37, '五因子相乘應該精確等於既有 dupontDecomposedRoeQ 基準值 11.37');
  assert.equal(extendedRoeQ!.nullReason, null);

  assert.equal(Number(taxBurdenTtm!.value), 83.85);
  assert.equal(Number(interestBurdenTtm!.value), 99.56);
  assert.equal(Number(ebitMarginTtm!.value), 60.35);
  assert.equal(Number(extendedRoeTtm!.value), 34.57, '五因子相乘應該精確等於既有 dupontDecomposedRoeTtm 基準值 34.57');
  assert.equal(extendedRoeTtm!.nullReason, null);
});

test('dupontFamilyPit: 重跑同一組座標，去重邏輯應該讓第二次全部 skipped_unchanged，且列數維持 1', async () => {
  await computeAndWriteDupontFamilyPit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });
  const second = await computeAndWriteDupontFamilyPit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(second.netProfitMarginQ, { action: 'skipped_unchanged' });
  assert.deepEqual(second.assetTurnoverQ, { action: 'skipped_unchanged' });
  assert.deepEqual(second.assetTurnoverQAnn, { action: 'skipped_unchanged' });
  assert.deepEqual(second.equityMultiplier, { action: 'skipped_unchanged' });
  assert.deepEqual(second.dupontDecomposedRoeQ, { action: 'skipped_unchanged' });

  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2887', metricCode: 'dupontDecomposedRoe', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(count, 1, '重複寫入同一個座標不應該疊加成多列');
});

test('dupontFamilyPit: 2317 115Q2——financial_report_announcement 無覆蓋，knowledge_date 應該標記為 fallback', async () => {
  const outcome = await computeAndWriteDupontFamilyPit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.netProfitMarginQ, undefined);
  const netProfitMarginQ = await findLatest('2317', 'netProfitMargin', 'Q', 2026, 2);
  assert.ok(netProfitMarginQ, '2317 115Q2 損益表/資產負債表皆有資料，periodType=Q 應該算得出來並寫入');
  assert.equal(netProfitMarginQ!.knowledgeDateIsFallback, true, '2317 完全沒有公告日覆蓋，knowledge_date 應該是 reportDate fallback');
});

// 損益表/資產負債表依賴指標換源到 XBRL 之後（2026-09-07），舊表原本缺漏的 2317 114Q4
// 損益表被 XBRL 補齊了，115Q2 的 TTM 因此從 insufficient_history 變成算得出真實數字——
// 這是換源後覆蓋率變廣的正面副作用，這裡直接驗證換源後的真實數字（用四季 XBRL 營收/淨利
// 加總跟本季期末總資產/權益手動核算過）。
test('dupontFamilyPit: 2317 115Q2 的 TTM 換源後（XBRL 補齊 114Q4）應該算得出真實數字，不再是 insufficient_history', async () => {
  await computeAndWriteDupontFamilyPit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const netProfitMarginTtm = await findLatest('2317', 'netProfitMargin', 'TTM', 2026, 2);
  const assetTurnoverTtm = await findLatest('2317', 'assetTurnover', 'TTM', 2026, 2);
  const decomposedRoeTtm = await findLatest('2317', 'dupontDecomposedRoe', 'TTM', 2026, 2);

  assert.ok(netProfitMarginTtm && assetTurnoverTtm && decomposedRoeTtm, '3 個 TTM metric_code 都應該寫入真實數字');
  // 114Q3~115Q2 四季營收加總 9310748978、淨利加總 212778460，除以 115Q2 期末
  // totalAssets 5622576474 / equityAttributableToParent 1907936607，手動核算過：
  // netProfitMargin=2.29%、assetTurnover=1.66 次、decomposedRoe = round2(2.29*1.66*2.95) = 11.21%。
  assert.equal(Number(netProfitMarginTtm!.value), 2.29);
  assert.equal(netProfitMarginTtm!.nullReason, null);
  assert.equal(Number(assetTurnoverTtm!.value), 1.66);
  assert.equal(assetTurnoverTtm!.nullReason, null);
  assert.equal(Number(decomposedRoeTtm!.value), 11.21);
  assert.equal(decomposedRoeTtm!.nullReason, null);
});

test('dupontFamilyPit: 9999（查無資料的公司）應該優雅降級，全部 metric_code 都不寫入', async () => {
  const outcome = await computeAndWriteDupontFamilyPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.equal(outcome.season, null);
  assert.deepEqual(outcome.netProfitMarginQ, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.assetTurnoverQ, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.equityMultiplier, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.dupontDecomposedRoeQ, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: ['netProfitMargin', 'assetTurnover', 'equityMultiplier', 'dupontDecomposedRoe'] } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
