import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteCashFlowValuationFamilyPit } from '@/domainPitMetrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 「全市場六季財報深度解鎖的指標」批次——一次查詢拆 8 個 TTM-only metricCode，見
// computeCashFlowValuationFamilyPit.ts 檔頭說明。用 2330 真實資料驗證。

const CODES = ['evToOcf', 'evToSales', 'priceToOcf', 'debtToFcf', 'capexToOcfRatio', 'croic', 'ocfMargin', 'fcfConversionRate'];

beforeAll(async () => {
  await Promise.all(CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
});

test('cashFlowValuationFamilyPit: 2330 八個 metricCode 都應該算出非 null 的 TTM 值', async () => {
  const outcome = await computeAndWriteCashFlowValuationFamilyPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);

  const rows = await analysisPrisma.metricValue.findMany({
    where: { symbol: '2330', metricCode: { in: CODES }, periodType: 'TTM' },
    orderBy: { knowledgeDate: 'desc' },
  });
  const byCode = new Map(rows.map((r) => [r.metricCode, r]));

  for (const code of CODES) {
    const row = byCode.get(code);
    assert.ok(row, `${code} 應該有寫入`);
    assert.ok(row!.value !== null, `2330 資料完整，${code} 不應該是 null`);
  }
});

test('cashFlowValuationFamilyPit: capexToOcfRatio 應該是正數（絕對值），即使 capex 本身在 XBRL 是負數', async () => {
  const row = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'capexToOcfRatio', periodType: 'TTM' },
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(row);
  assert.ok(Number(row!.value) > 0, 'capexToOcfRatio 應該呈現正的比率，不是因為 capex 帶負號而變負數');
});

test('cashFlowValuationFamilyPit: 9999（查無資料的公司）應該優雅降級，全部 skipped_no_quarter', async () => {
  const outcome = await computeAndWriteCashFlowValuationFamilyPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(outcome.rocYear, null);
  assert.deepEqual(outcome.evToOcf, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.fcfConversionRate, { action: 'skipped_no_quarter' });
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
