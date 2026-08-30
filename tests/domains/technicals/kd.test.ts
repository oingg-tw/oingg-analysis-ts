import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateKd } from '@/domains/technicals/kd/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

test('kd: 2330 歷史夠深，K/D 都算得出 0~100 之間的值', async () => {
  const result = await calculateKd({ companyId: '2330' });

  assert.ok(result.asOfDate !== null);
  for (const key of ['k9d', 'd9d', 'k14d', 'd14d'] as const) {
    const window = result[key];
    assert.ok(window.value !== null, `2330 資料量足夠，${key} 應該算得出來`);
    assert.ok(window.value! >= 0 && window.value! <= 100, `${key}=${window.value} 超出 KD 合理範圍`);
  }
  assert.deepEqual(result.fieldStatuses, {});
});

test('kd: 資料量不足時回傳 null 並標成 no_data，不是拋錯', async () => {
  const result = await calculateKd({ companyId: '1337' });
  if (result.dataCoverage.tradingDays < 14) {
    assert.equal(result.k14d.value, null);
    assert.equal(result.d14d.value, null);
    assert.equal(result.fieldStatuses.k14d?.status, 'no_data');
  }
});

test('kd: 9999（查無資料的公司）回傳 not_applicable', async () => {
  const result = await calculateKd({ companyId: '9999' });
  assert.equal(result.asOfDate, null);
  for (const key of ['k9d', 'd9d', 'k14d', 'd14d'] as const) {
    assert.equal(result[key].value, null);
    assert.equal(result.fieldStatuses[key]?.status, 'not_applicable');
  }
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
