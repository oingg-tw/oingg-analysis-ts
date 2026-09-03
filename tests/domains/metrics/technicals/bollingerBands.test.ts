import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBollingerBands } from '@/domainBatch/metrics/technicals/bollingerBands/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

test('bollingerBands: 2330 歷史夠深，上軌 >= 中軌 >= 下軌', async () => {
  const result = await calculateBollingerBands({ companyId: '2330' });

  assert.ok(result.asOfDate !== null);
  assert.ok(result.middle.value !== null && result.upper.value !== null && result.lower.value !== null);
  assert.ok(result.upper.value! >= result.middle.value!);
  assert.ok(result.middle.value! >= result.lower.value!);
  assert.deepEqual(result.fieldStatuses, {});
});

test('bollingerBands: 資料量不足時三個欄位都回傳 null 並標成 no_data，不是拋錯', async () => {
  const result = await calculateBollingerBands({ companyId: '1337' });
  if (result.dataCoverage.tradingDays < 20) {
    assert.equal(result.middle.value, null);
    assert.equal(result.fieldStatuses.middle?.status, 'no_data');
  }
});

test('bollingerBands: 9999（查無資料的公司）回傳 not_applicable', async () => {
  const result = await calculateBollingerBands({ companyId: '9999' });
  assert.equal(result.asOfDate, null);
  for (const key of ['middle', 'upper', 'lower'] as const) {
    assert.equal(result[key].value, null);
    assert.equal(result.fieldStatuses[key]?.status, 'not_applicable');
  }
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
