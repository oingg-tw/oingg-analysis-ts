import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteAuditOpinionRiskPit } from '@/domainPitMetrics/resilience/auditOpinionRisk/computeAuditOpinionRiskPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 應 web-nuxt/bff-ts 要求新增——查核意見類型編碼成 0~4 序列風險分數，見
// computeAuditOpinionRiskPit.ts 檔頭說明。用 2330 真實資料驗證：115Q2 實測
// unqualified_opinion='Y'，其餘 4 個旗標皆 null，應該編碼成 riskScore=0（無保留意見）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.auditOpinionRisk!);
});

test('auditOpinionRiskPit: 2330 115Q2 應該是 0（無保留意見）', async () => {
  const outcome = await computeAndWriteAuditOpinionRiskPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);

  const row = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'auditOpinionRisk', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(row, 'auditOpinionRisk 應該有寫入');
  assert.equal(Number(row!.value), 0, '2330 115Q2 實測是無保留意見，應該編碼成 0');
  assert.equal(row!.nullReason, null);
});

test('auditOpinionRiskPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteAuditOpinionRiskPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(outcome.rocYear, null);
  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'auditOpinionRisk' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
