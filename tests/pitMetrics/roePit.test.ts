import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteRoePit, resolveRoeQuarterData } from '@/domainPitMetrics/profitability/roe/computeRoePit';
import type { IncomeStatementPort, BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
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

  const findLatest = (periodType: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'roe', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q, 'periodType=Q 應該有寫入 metric_values');
  assert.ok(ttm, 'periodType=TTM 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 10.98);
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
  // 2887 115Q1 的 TTM 是否齊全視實際資料而定，只要 periodType 有被計算（不是 skipped_no_quarter/
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

// 2317：financial_report_announcement 完全零筆覆蓋（實測確認），保證 Q 落到
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
  assert.ok(q, '2317 115Q2 損益表/資產負債表皆有資料，periodType=Q 應該算得出來並寫入');
  assert.equal(q!.knowledgeDateIsFallback, true, '2317 完全沒有公告日覆蓋，knowledge_date 應該是 reportDate fallback');
});

test('roePit: 2317 115Q2 的 TTM 換源後（XBRL 補齊 114Q4）應該算得出真實數字，不再是 insufficient_history', async () => {
  await computeAndWriteRoePit({ symbol: '2317', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2317', metricCode: 'roe', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'periodType=TTM 應該有寫入 metric_values');
  // 114Q3~115Q2 四季 netIncomeAttributableToParent 加總 212778460，除以 115Q2 期末
  // equityAttributableToParent 1907936607，手動核算過等於 11.15%。
  assert.equal(Number(ttm!.value), 11.15);
  assert.equal(ttm!.nullReason, null);
});

test('roePit: 9999（查無資料的公司）應該優雅降級，都不寫入', async () => {
  const outcome = await computeAndWriteRoePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.equal(outcome.season, null);
  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'roe' } });
  assert.equal(count, 0);
});

// 2026-09-13 依存反轉（DIP）示範的實際效益：塞假的 FinancialStatementPort，不用去資料庫
// 裡找一家真的「權益剛好是負值」的公司才能測邊界案例——resolveRoeQuarterData 本身不碰
// Prisma，這裡完全掌控輸入，边界案例想要多精確就多精確。注意 resolveKnowledgeDate（決定
// knowledge_date 用哪個公告日）跟 mainAnchor 解析仍然會查真實的 financial_report_announcement
// 資料（DIP 這次示範沒有涵蓋這一層，只涵蓋損益表/資產負債表這兩個依賴），所以這裡用
// 一家真實存在、有正常公告日覆蓋的公司（2330）當座標，只有「損益表/資產負債表回傳
// 什麼數字」是假的，其餘查詢管線不變。
test('roePit（DIP 示範）: 塞假的 FinancialStatementPort，驗證權益為負時仍算出真實負值不是 null', async () => {
  const fakeStatements: IncomeStatementPort & BalanceSheetPort = {
    getIncomeStatement: async () => ({
      operatingRevenue: 1000n,
      operatingCost: null,
      grossProfit: null,
      operatingIncome: null,
      profitBeforeTax: null,
      sellingExpenses: null,
      adminExpenses: null,
      financeCosts: null,
      incomeTaxExpense: null,
      netIncomeAttributableToParent: 100n,
      netIncome: 100n,
      reportDate: new Date('2026-06-30'),
    }),
    getBalanceSheet: async () => ({
      currentAssets: null,
      totalAssets: null,
      propertyPlantEquipment: null,
      retainedEarnings: null,
      currentLiabilities: null,
      totalLiabilities: null,
      shortTermBorrowings: null,
      bondsPayable: null,
      longTermBorrowings: null,
      cashAndEquivalents: null,
      accountsReceivable: null,
      inventory: null,
      accountsPayable: null,
      preferredStockCapital: null,
      equityAttributableToParent: -500n,
      totalEquity: -500n,
      reportDate: new Date('2026-06-30'),
    }),
  };

  const resolution = await resolveRoeQuarterData({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' }, fakeStatements);

  assert.ok(resolution, '假資料完整（淨利/權益皆非 null），應該解析得出結果');
  assert.equal(resolution!.netIncome.value, 100n);
  assert.equal(resolution!.equity.value, -500n);
  // ROE = 100/(-500)*100 = -20%，權益為負仍然算出真實（可能扭曲的）負值，不隱藏成 null——
  // 這條斷言不需要去資料庫裡找一家真的資不抵債的公司才能驗證。
  assert.equal(resolution!.roeQuarterlyPct, -20);
  assert.equal(resolution!.quarterlyNullReason, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
