import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteRoaPit } from '@/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 第二批遷移（ROA）——src/domainPitMetrics/profitability/roa/computeRoaPit.ts 是 src/domainMetrics/roa.ts 的
// 獨立重新實作（不呼叫 calculateRoa()，見 computeRoaPit.ts 檔頭說明），這裡拿
// tests/domains/metrics/roa.test.ts 裡 2330 115Q2 的既有基準數字交叉驗證，測試結構完全比照
// tests/domainPitMetrics/roePit.test.ts。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.roa!);
});

test('roaPit: 2330 115Q2 合併報表，跟 roa.test.ts 的既有基準數字交叉驗證', async () => {
  await computeAndWriteRoaPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'roa', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q, 'periodType=Q 應該有寫入 metric_values');
  assert.ok(ttm, 'periodType=TTM 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 7.54);
  assert.equal(Number(ttm!.value), 23.86);
  assert.equal(q!.nullReason, null);
  assert.equal(ttm!.nullReason, null);
  // 2330 的 financial_report_announcement 已驗證覆蓋到 115Q2，不應該落到 fallback。
  assert.equal(q!.knowledgeDateIsFallback, false);
});

test('roaPit: 重跑同一組座標，去重邏輯應該讓第二次全部 skipped_unchanged，且列數維持 1', async () => {
  await computeAndWriteRoaPit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });
  const second = await computeAndWriteRoaPit({ symbol: '2887', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(second.q, { action: 'skipped_unchanged' });
  if (!second.ttm || ('action' in second.ttm && (second.ttm.action === 'skipped_no_quarter' || second.ttm.action === 'skipped_no_knowledge_date'))) {
    // 這組座標本來就算不出 TTM，不構成去重測試的一部分。
  } else {
    assert.deepEqual(second.ttm, { action: 'skipped_unchanged' });
  }

  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2887', metricCode: 'roa', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(count, 1, '重複寫入同一個座標不應該疊加成多列');
});

// 2317：financial_report_announcement 完全零筆覆蓋，見 roePit.test.ts 同一組案例的說明。
// 換源到 XBRL 之後（2026-09-07）舊表原本缺漏的 114Q4 損益表被補齊，TTM 從
// insufficient_history 變成算得出真實數字，這裡驗證換源後的真實情況。
test('roaPit: 2317 115Q2——financial_report_announcement 無覆蓋，knowledge_date 應該標記為 fallback', async () => {
  const outcome = await computeAndWriteRoaPit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.q, undefined);
  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2317', metricCode: 'roa', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(q, '2317 115Q2 損益表/資產負債表皆有資料，periodType=Q 應該算得出來並寫入');
  assert.equal(q!.knowledgeDateIsFallback, true, '2317 完全沒有公告日覆蓋，knowledge_date 應該是 reportDate fallback');
});

test('roaPit: 2317 115Q2 的 TTM 換源後（XBRL 補齊 114Q4）應該算得出真實數字，不再是 insufficient_history', async () => {
  await computeAndWriteRoaPit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2317', metricCode: 'roa', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'periodType=TTM 應該有寫入 metric_values');
  // 114Q3~115Q2 四季 netIncomeAttributableToParent 加總 212778460，除以 115Q2 期末
  // totalAssets 5622576474，手動核算過等於 3.78%。
  assert.equal(Number(ttm!.value), 3.78);
  assert.equal(ttm!.nullReason, null);
});

test('roaPit: 9999（查無資料的公司）應該優雅降級，都不寫入', async () => {
  const outcome = await computeAndWriteRoaPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.equal(outcome.season, null);
  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'roa' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
