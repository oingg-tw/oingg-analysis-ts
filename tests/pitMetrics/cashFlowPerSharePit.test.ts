import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteCashFlowPerSharePit } from '@/domainPitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第三批遷移（cashFlowPerShare -> ocfPerShare/fcfPerShare 兩個 metric_code）——跟
// tests/domains/metrics/cashFlowPerShare.test.ts 的既有基準數字交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.ocfPerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.fcfPerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.depreciationAmortizationPerShare!);
});

test('cashFlowPerSharePit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteCashFlowPerSharePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (metricCode: string, periodType: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode, periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const ocfQ = await findLatest('ocfPerShare', 'Q');
  const ocfTtm = await findLatest('ocfPerShare', 'TTM');
  const fcfQ = await findLatest('fcfPerShare', 'Q');
  const fcfTtm = await findLatest('fcfPerShare', 'TTM');
  const daQ = await findLatest('depreciationAmortizationPerShare', 'Q');
  const daTtm = await findLatest('depreciationAmortizationPerShare', 'TTM');

  assert.ok(ocfQ && ocfTtm && fcfQ && fcfTtm && daQ && daTtm, '三個 metric_code 各 2 個 periodType 應該全部寫入');
  assert.equal(Number(ocfQ!.value), 30.21);
  assert.equal(Number(ocfTtm!.value), 101.6);
  assert.equal(Number(fcfQ!.value), 11.08);
  assert.equal(Number(fcfTtm!.value), 44.1);
  assert.equal(Number(daQ!.value), 7.66);
  assert.equal(Number(daTtm!.value), 26.56);
});

test('cashFlowPerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteCashFlowPerSharePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ocfPerShareQ, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: ['ocfPerShare', 'fcfPerShare', 'depreciationAmortizationPerShare'] } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
