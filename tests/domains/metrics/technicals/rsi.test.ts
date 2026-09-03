import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRsi } from '@/domainApi/metrics/technicals/rsi/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

test('rsi: 2330 歷史夠深，三個窗口都算得出 0~100 之間的值', async () => {
  const result = await calculateRsi({ companyId: '2330' });

  assert.ok(result.asOfDate !== null);
  for (const key of ['rsi6d', 'rsi14d', 'rsi24d'] as const) {
    const window = result[key];
    assert.ok(window.value !== null, `2330 資料量足夠，${key} 應該算得出來`);
    assert.ok(window.value! >= 0 && window.value! <= 100, `${key}=${window.value} 超出 RSI 合理範圍`);
  }
  assert.deepEqual(result.fieldStatuses, {});
});

test('rsi: 資料量不足時回傳 null 並標成 no_data，不是拋錯', async () => {
  const result = await calculateRsi({ companyId: '1337' });
  if (result.dataCoverage.tradingDays < 25) {
    assert.equal(result.rsi24d.value, null);
    assert.equal(result.fieldStatuses.rsi24d?.status, 'no_data');
  }
});

test('rsi: 9999（查無資料的公司）回傳 not_applicable', async () => {
  const result = await calculateRsi({ companyId: '9999' });
  assert.equal(result.asOfDate, null);
  for (const key of ['rsi6d', 'rsi14d', 'rsi24d'] as const) {
    assert.equal(result[key].value, null);
    assert.equal(result.fieldStatuses[key]?.status, 'not_applicable');
  }
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
