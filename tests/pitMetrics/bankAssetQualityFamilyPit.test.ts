import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteBankAssetQualityFamilyPit } from '@/pitMetrics/resilience/bankAssetQuality/computeBankAssetQualityFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 全新的銀行業專屬指標——直接讀 mops-ts 的 bank_asset_quality_xbrl（category='TotalLoans'）
// 已經算好的比率，跟 2026-09-06 盤點技術債時直接查 export DB 驗證過的真實數字交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.bankNplRatio!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankNplCoverageRatio!);
});

test('bankAssetQualityFamilyPit: 2801（彰化銀行）115Q2，跟實測驗證過的真實數字交叉驗證', async () => {
  await computeAndWriteBankAssetQualityFamilyPit({ symbol: '2801', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2801', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const npl = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankNplRatio', basis: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  const coverage = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankNplCoverageRatio', basis: 'Q' }, orderBy: { knowledgeDate: 'desc' } });

  assert.ok(npl, 'bankNplRatio 應該有寫入');
  assert.equal(Number(npl!.value), 0.15);
  assert.equal(npl!.nullReason, null);
  assert.ok(coverage, 'bankNplCoverageRatio 應該有寫入');
  assert.equal(Number(coverage!.value), 901.58);
  assert.equal(coverage!.nullReason, null);
});

test('bankAssetQualityFamilyPit: 2330（台積電，真實存在但不是銀行）應該優雅降級成 missing_input 的 null 列，不是不寫入', async () => {
  // 2330 在 bank_asset_quality_xbrl 完全查無列，但 financial_report_announcement 有這家
  // 公司這一季的真實公告日資料（跟 bank 資料來源無關的另一張表）——knowledge_date 照樣解得
  // 出來，所以會寫入一筆 value:null/nullReason:'missing_input' 的列，不是 skipped。
  // 不斷言 outcome 的 write action 字面值（inserted/skipped_unchanged 取決於這個 symbol/
  // 季度組合先前有沒有跑過，dev DB 是持久狀態不是每次測試都乾淨）——只驗證最終 DB 狀態。
  await computeAndWriteBankAssetQualityFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2330', metricCode: 'bankNplRatio', basis: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const npl = await analysisPrisma.metricValue.findFirst({ where, orderBy: { knowledgeDate: 'desc' } });
  assert.ok(npl);
  assert.equal(npl!.value, null);
  assert.equal(npl!.nullReason, 'missing_input');
});

test('bankAssetQualityFamilyPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteBankAssetQualityFamilyPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.bankNplRatio, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'bankNplRatio' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
