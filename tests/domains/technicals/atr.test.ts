import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAtr } from '@/domains/technicals/atr/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

test('atr: 2330 歷史夠深，兩個窗口都算得出非負值', async () => {
  const result = await calculateAtr({ companyId: '2330' });

  assert.ok(result.asOfDate !== null);
  for (const key of ['atr14d', 'atr20d'] as const) {
    const window = result[key];
    assert.ok(window.value !== null, `2330 資料量足夠，${key} 應該算得出來`);
    assert.ok(window.value! >= 0, `${key}=${window.value} 不應該是負值（真實波動幅度不會小於零）`);
  }
  assert.deepEqual(result.fieldStatuses, {});
});

test('atr: 資料量不足時回傳 null 並標成 no_data，不是拋錯', async () => {
  const result = await calculateAtr({ companyId: '1337' });
  if (result.dataCoverage.tradingDays < 21) {
    assert.equal(result.atr20d.value, null);
    assert.equal(result.fieldStatuses.atr20d?.status, 'no_data');
  }
});

test('atr: 9999（查無資料的公司）回傳 not_applicable', async () => {
  const result = await calculateAtr({ companyId: '9999' });
  assert.equal(result.asOfDate, null);
  for (const key of ['atr14d', 'atr20d'] as const) {
    assert.equal(result[key].value, null);
    assert.equal(result.fieldStatuses[key]?.status, 'not_applicable');
  }
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
