import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteMarginsFamilyPit } from '@/application/metrics/profitability/margins/computeMarginsFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 第五批遷移（margins 補完整：grossMargin/operatingMargin）——跟
// tests/domains/metrics/margins.test.ts 的既有基準數字交叉驗證（該測試檔案只釘了
// quarterly 值，沒有 TTM 值，所以這裡也只驗證 Q，TTM 只驗證有寫入不驗證精確值）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.grossMargin!);
  await upsertMetricDefinition(metricDefinitionRegistry.operatingMargin!);
});

test('marginsFamilyPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteMarginsFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const grossQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'grossMargin', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  const operatingQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'operatingMargin', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(grossQ && operatingQ, 'Q basis 應該都寫入');
  assert.equal(Number(grossQ!.value), 67.72);
  assert.equal(Number(operatingQ!.value), 60.34);
  assert.equal(grossQ!.nullReason, null);
});

// 2026-09-08 新增：保險業（IFRS17）替代科目 fallback。2851（中再保）在舊架構
// legacy 表完全沒有列（連「最新一季」都解析不出來，不只是欄位缺漏），驗證兩層
// fallback（季度解析 + 欄位替代）都要正確接上，不是只解其中一層。跟
// insurance_income_statement_detail_xbrl 的真實資料手動核算過：115Q2
// insurance_revenue_quarter=3393632、insurance_service_result_quarter=510604、
// net_operating_income_loss_quarter=5124365，grossMargin=510604/3393632*100=15.05、
// operatingMargin=5124365/3393632*100=151（保險業 operatingMargin 超過 100% 是真實
// 現象，不是算錯——保險服務結果之外的淨投資損益可能遠大於保費規模本身）。
test('marginsFamilyPit: 2851（中再保，legacy 表完全無資料）應該 fallback 到保險替代科目', async () => {
  const outcome = await computeAndWriteMarginsFamilyPit({ symbol: '2851', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.rocYear, null, '應該能透過保險替代來源解析出最新一季，不是 skipped_no_quarter');

  const grossQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2851', metricCode: 'grossMargin', periodType: 'Q' },
    orderBy: { knowledgeDate: 'desc' },
  });
  const operatingQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2851', metricCode: 'operatingMargin', periodType: 'Q' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(grossQ && operatingQ, '保險替代科目應該讓 Q basis 都算得出來');
  assert.equal(Number(grossQ!.value), 15.05);
  assert.equal(Number(operatingQ!.value), 151);
  assert.equal(grossQ!.nullReason, null);
});

// 2026-09-11 舊三大表已退役後重新驗證過：2867（三商美邦人壽）合併報表（dataType='2'）
// 一般 quarterly_income_statement_xbrl 完全零列，insurance_income_statement_detail_xbrl
// 雖然對這家公司有列，但有 insurance_revenue_quarter 非 null 值的那幾列是 data_type='1'
// （個體）不是 '2'（合併）——合併口徑兩層來源都連「最新一季」都解析不出來，不是「季度
// 解析得出來、只是 revenue 欄位缺漏」，退役舊表前用舊表能解析出季度是巧合，不是這個
// 案例真正該有的行為。跟 9999（完全查無資料的公司）同一種 skipped_no_quarter 優雅
// 降級，不寫入任何列。
test('marginsFamilyPit: 2867（三商美邦人壽，合併報表兩層來源都無法解析季度）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteMarginsFamilyPit({ symbol: '2867', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.deepEqual(outcome.grossMarginQ, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '2867', metricCode: { in: ['grossMargin', 'operatingMargin'] } } });
  assert.equal(count, 0);
});

test('marginsFamilyPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteMarginsFamilyPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.grossMarginQ, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: ['grossMargin', 'operatingMargin'] } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
