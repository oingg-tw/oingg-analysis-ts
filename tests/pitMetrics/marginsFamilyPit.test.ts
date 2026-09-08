import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteMarginsFamilyPit } from '@/pitMetrics/profitability/margins/computeMarginsFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

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
    where: { symbol: '2330', metricCode: 'grossMargin', basis: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  const operatingQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'operatingMargin', basis: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
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
    where: { symbol: '2851', metricCode: 'grossMargin', basis: 'Q' },
    orderBy: { knowledgeDate: 'desc' },
  });
  const operatingQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2851', metricCode: 'operatingMargin', basis: 'Q' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(grossQ && operatingQ, '保險替代科目應該讓 Q basis 都算得出來');
  assert.equal(Number(grossQ!.value), 15.05);
  assert.equal(Number(operatingQ!.value), 151);
  assert.equal(grossQ!.nullReason, null);
});

// 2867（三商美邦人壽）legacy 表有列（能解析出最新一季），但 insurance_income_statement_
// detail_xbrl 目前完全沒有這家公司的資料（不是 insurance_revenue_quarter 是 null，是
// 整張表對這個 symbol 零列）——mops-ts 的保險業明細表回填還沒涵蓋到它。這代表兩層來源
// 都查無可用的 revenue，正確結果應該是 missing_input，不是算得出來；跟 2851（保險
// 替代科目確實有資料）不是同一種情境，這裡驗證的是「保險替代也查無資料時仍然優雅
// 降級，不是誤判成 0 或拋錯」。
test('marginsFamilyPit: 2867（三商美邦人壽，legacy/保險替代都缺 revenue）應該優雅降級為 missing_input', async () => {
  const outcome = await computeAndWriteMarginsFamilyPit({ symbol: '2867', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.rocYear, null, 'legacy 表能解析出最新一季');

  const grossQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2867', metricCode: 'grossMargin', basis: 'Q' },
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(grossQ, '應該有寫入一列，只是 value 是 null');
  assert.equal(grossQ!.value, null);
  assert.equal(grossQ!.nullReason, 'missing_input');
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
