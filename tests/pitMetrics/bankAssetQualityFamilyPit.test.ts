import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteBankAssetQualityFamilyPit } from '@/domainPitMetrics/resilience/bankAssetQuality/computeBankAssetQualityFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 全新的銀行業專屬指標——直接讀 mops-ts 的 bank_asset_quality_xbrl（category='TotalLoans'）
// 已經算好的比率，跟 2026-09-06 盤點技術債時直接查 export DB 驗證過的真實數字交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.bankNplRatio!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankNplCoverageRatio!);
});

test('bankAssetQualityFamilyPit: 2801（彰化銀行）115Q2，跟實測驗證過的真實數字交叉驗證', async () => {
  await computeAndWriteBankAssetQualityFamilyPit({ symbol: '2801', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2801', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const npl = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankNplRatio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  const coverage = await analysisPrisma.metricValue.findFirst({ where: { ...where, metricCode: 'bankNplCoverageRatio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });

  assert.ok(npl, 'bankNplRatio 應該有寫入');
  assert.equal(Number(npl!.value), 0.15);
  assert.equal(npl!.nullReason, null);
  assert.ok(coverage, 'bankNplCoverageRatio 應該有寫入');
  assert.equal(Number(coverage!.value), 901.58);
  assert.equal(coverage!.nullReason, null);
});

test('bankAssetQualityFamilyPit: 2330（台積電，真實存在但不是銀行）應該完全不寫入任何列', async () => {
  // 2026-09-14 修正：原本非銀行公司會優雅降級成 value:null/nullReason:'missing_input'
  // 的列，實測發現上游 bank_capital_adequacy_detail_xbrl 對 2330 曾經誤植過非 null 值，
  // 導致這類「一律不做產業前置判斷」的設計對非銀行公司做了無意義的查詢——現在改成一開始
  // 就用 isFinancialIndustryCompany 擋掉，2330 不是金融保險業，直接回傳 skipped_no_quarter，
  // 不寫入任何 metric_value 列。
  const outcome = await computeAndWriteBankAssetQualityFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.bankNplRatio, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.bankNplCoverageRatio, { action: 'skipped_no_quarter' });
  const where = { symbol: '2330', metricCode: 'bankNplRatio', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const npl = await analysisPrisma.metricValue.findFirst({ where, orderBy: { knowledgeDate: 'desc' } });
  assert.equal(npl, null);
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
