import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteDupontFamilyPit } from '@/pitMetrics/dupont/computeDupontFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第二批遷移（Dupont 拆解家族）——src/pitMetrics/dupont/computeDupontFamilyPit.ts 是
// src/domainMetrics/margins.ts（僅 netProfitMargin）/turnoverRatio.ts（僅 assetTurnover）/
// dupont.ts 三支舊架構檔案的獨立重新實作，這裡拿 tests/domains/metrics/dupont.test.ts 裡
// 2330 115Q2 的既有基準數字交叉驗證，測試結構比照 tests/pitMetrics/roePit.test.ts。

const findLatest = (symbol: string, metricCode: string, basis: string, fiscalYear: number, fiscalQuarter: number) =>
  analysisPrisma.metricValue.findFirst({
    where: { symbol, metricCode, basis, fiscalYear, fiscalQuarter, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

beforeAll(async () => {
  await Promise.all([
    upsertMetricDefinition(metricDefinitionRegistry.netProfitMargin!),
    upsertMetricDefinition(metricDefinitionRegistry.assetTurnover!),
    upsertMetricDefinition(metricDefinitionRegistry.equityMultiplier!),
    upsertMetricDefinition(metricDefinitionRegistry.dupontDecomposedRoe!),
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

test('dupontFamilyPit: 重跑同一組座標，去重邏輯應該讓第二次全部 skipped_unchanged，且列數維持 1', async () => {
  await computeAndWriteDupontFamilyPit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });
  const second = await computeAndWriteDupontFamilyPit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(second.netProfitMarginQ, { action: 'skipped_unchanged' });
  assert.deepEqual(second.assetTurnoverQ, { action: 'skipped_unchanged' });
  assert.deepEqual(second.assetTurnoverQAnn, { action: 'skipped_unchanged' });
  assert.deepEqual(second.equityMultiplier, { action: 'skipped_unchanged' });
  assert.deepEqual(second.dupontDecomposedRoeQ, { action: 'skipped_unchanged' });

  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2887', metricCode: 'dupontDecomposedRoe', basis: 'Q', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(count, 1, '重複寫入同一個座標不應該疊加成多列');
});

test('dupontFamilyPit: 2317 115Q2——financial_report_announcement 無覆蓋，knowledge_date 應該標記為 fallback', async () => {
  const outcome = await computeAndWriteDupontFamilyPit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.netProfitMarginQ, undefined);
  const netProfitMarginQ = await findLatest('2317', 'netProfitMargin', 'Q', 2026, 2);
  assert.ok(netProfitMarginQ, '2317 115Q2 損益表/資產負債表皆有資料，basis=Q 應該算得出來並寫入');
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
