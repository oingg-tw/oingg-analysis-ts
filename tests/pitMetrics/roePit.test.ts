import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteRoePit } from '@/domainPitMetrics/profitability/roe/computeRoePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// ROE spike 驗證——src/domainPitMetrics/profitability/roe/computeRoePit.ts 是 src/domainMetrics/roe.ts 的獨立
// 重新實作（不呼叫 calculateRoe()，見 computeRoePit.ts 檔頭說明），這裡拿 tests/domains/metrics/roe.test.ts
// 裡 2330 115Q2 的既有基準數字交叉驗證：這些數字不是從呼叫 calculateRoe() 拿到的，是兩份
// 獨立實作各自算出來又剛好一致，才是真正驗證新管線的計算邏輯沒錯（不是同一份邏輯繞一圈）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.roe!);
});

test('roePit: 2330 115Q2 合併報表，跟 roe.test.ts 的既有基準數字交叉驗證', async () => {
  await computeAndWriteRoePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (basis: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'roe', periodType: basis, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const q = await findLatest('Q');
  const qAnn = await findLatest('Q_ANN');
  const ttm = await findLatest('TTM');

  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.ok(qAnn, 'basis=Q_ANN 應該有寫入 metric_values');
  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 10.98);
  assert.equal(Number(qAnn!.value), 43.92);
  assert.equal(Number(ttm!.value), 34.78);
  assert.equal(q!.nullReason, null);
  assert.equal(ttm!.nullReason, null);
  // 2330 的 financial_report_announcement 已驗證覆蓋到 115Q2，不應該落到 fallback。
  assert.equal(q!.knowledgeDateIsFallback, false);
});

test('roePit: 重跑同一組座標，去重邏輯應該讓第二次全部 skipped_unchanged，且列數維持 1', async () => {
  await computeAndWriteRoePit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });
  const second = await computeAndWriteRoePit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(second.q, { action: 'skipped_unchanged' });
  assert.deepEqual(second.qAnn, { action: 'skipped_unchanged' });
  // 2887 115Q1 的 TTM 是否齊全視實際資料而定，只要 basis 有被計算（不是 skipped_no_quarter/
  // skipped_no_knowledge_date），第二次呼叫就一定要落在 skipped_unchanged。
  if ('action' in second.ttm && (second.ttm.action === 'skipped_no_quarter' || second.ttm.action === 'skipped_no_knowledge_date')) {
    // 這組座標本來就算不出 TTM，不構成去重測試的一部分。
  } else {
    assert.deepEqual(second.ttm, { action: 'skipped_unchanged' });
  }

  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2887', metricCode: 'roe', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(count, 1, '重複寫入同一個座標不應該疊加成多列');
});

// 2317：financial_report_announcement 完全零筆覆蓋（實測確認），保證 Q/Q_ANN 落到
// report_date_fallback。損益表/資產負債表依賴指標換源到 XBRL 之後（2026-09-07），舊表
// 原本缺漏的 114Q4 損益表被 XBRL 補齊了（舊表 quarterly_income_statement 完全查無這一列，
// XBRL quarterly_income_statement_xbrl 有真實資料），2317 115Q2 的 TTM 因此從
// insufficient_history 變成算得出真實數字——這是換源後覆蓋率變廣帶來的正面副作用，不是
// bug，這裡直接驗證換源後的真實數字（用四季 XBRL 淨利加總/本季期末權益手動核算過）。
test('roePit: 2317 115Q2——financial_report_announcement 無覆蓋，knowledge_date 應該標記為 fallback', async () => {
  const outcome = await computeAndWriteRoePit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.q, undefined);
  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2317', metricCode: 'roe', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(q, '2317 115Q2 損益表/資產負債表皆有資料，basis=Q 應該算得出來並寫入');
  assert.equal(q!.knowledgeDateIsFallback, true, '2317 完全沒有公告日覆蓋，knowledge_date 應該是 reportDate fallback');
});

test('roePit: 2317 115Q2 的 TTM 換源後（XBRL 補齊 114Q4）應該算得出真實數字，不再是 insufficient_history', async () => {
  await computeAndWriteRoePit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2317', metricCode: 'roe', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  // 114Q3~115Q2 四季 netIncomeAttributableToParent 加總 212778460，除以 115Q2 期末
  // equityAttributableToParent 1907936607，手動核算過等於 11.15%。
  assert.equal(Number(ttm!.value), 11.15);
  assert.equal(ttm!.nullReason, null);
});

test('roePit: 9999（查無資料的公司）應該優雅降級，三個 basis 都不寫入', async () => {
  const outcome = await computeAndWriteRoePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.equal(outcome.season, null);
  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.qAnn, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'roe' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
