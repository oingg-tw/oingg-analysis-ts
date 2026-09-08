import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteBankCapitalAdequacyFamilyPit } from '@/pitMetrics/resilience/bankCapitalAdequacy/computeBankCapitalAdequacyFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 全新的銀行業專屬指標——bankCet1Ratio/bankTier1Ratio 直接讀 mops-ts 的
// bank_capital_adequacy_detail_xbrl 已經算好的比率，bankCarRatio 是這批唯一自己做除法的
// 欄位。跟 2026-09-06 盤點技術債時直接查 export DB 驗證過的真實數字交叉驗證，包含「監理
// 揭露只有 Q2/Q4 有真實值」這個特性本身的邊界案例（115Q1 應該優雅降級成 missing_input）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.bankCarRatio!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankCet1Ratio!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankTier1Ratio!);
});

test('bankCapitalAdequacyFamilyPit: 2801（彰化銀行）115Q2（有揭露的季度），跟實測驗證過的真實數字交叉驗證', async () => {
  await computeAndWriteBankCapitalAdequacyFamilyPit({ symbol: '2801', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2801', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const car = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankCarRatio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  const cet1 = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankCet1Ratio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  const tier1 = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankTier1Ratio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });

  assert.ok(car, 'bankCarRatio 應該有寫入');
  assert.equal(Number(car!.value), 13.99);
  assert.equal(car!.nullReason, null);
  assert.ok(cet1, 'bankCet1Ratio 應該有寫入');
  assert.equal(Number(cet1!.value), 10.37);
  assert.ok(tier1, 'bankTier1Ratio 應該有寫入');
  assert.equal(Number(tier1!.value), 11.75);
});

test('bankCapitalAdequacyFamilyPit: 2801 115Q1（監理揭露半年一次，這季本來就沒揭露），應該優雅降級成 missing_input', async () => {
  await computeAndWriteBankCapitalAdequacyFamilyPit({ symbol: '2801', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2801', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' };
  const car = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankCarRatio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });

  assert.ok(car, 'basis=Q 應該有寫入（有 reportDate，只是值為 null）');
  assert.equal(car!.value, null);
  assert.equal(car!.nullReason, 'missing_input');
});

test('bankCapitalAdequacyFamilyPit: 不給 year/season 時自動抓最新一季，應該跳過值為 null 的季度', async () => {
  const outcome = await computeAndWriteBankCapitalAdequacyFamilyPit({ symbol: '2801', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.season, '2', '應該抓到 115Q2（有真實值的最新一季），不是曆法上更新但值為 null 的季度');
});

test('bankCapitalAdequacyFamilyPit: 2330（台積電，真實存在但不是銀行）應該優雅降級成 missing_input 的 null 列，不是不寫入', async () => {
  // bank_capital_adequacy_detail_xbrl 這張表的 XBRL tag 是廣泛提取的——2330 這種非銀行公司
  // 也有一列，只是財務欄位全部是 null（report_date 本身仍然是真實值）。knowledge_date 解得
  // 出來，所以會寫入一筆 value:null/nullReason:'missing_input' 的列，不是 skipped。
  // 不斷言 outcome 的 write action 字面值（inserted/skipped_unchanged 取決於這個 symbol/
  // 季度組合先前有沒有跑過，dev DB 是持久狀態不是每次測試都乾淨）——只驗證最終 DB 狀態。
  await computeAndWriteBankCapitalAdequacyFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2330', metricCode: 'bankCarRatio', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const car = await analysisPrisma.metricValue.findFirst({ where, orderBy: { knowledgeDate: 'desc' } });
  assert.ok(car);
  assert.equal(car!.value, null);
  assert.equal(car!.nullReason, 'missing_input');
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
