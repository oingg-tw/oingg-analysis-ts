import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMacd } from '@/domains/technicals/macd/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

test('macd: 2330 歷史夠深，DIF/DEM/OSC 都算得出來且已收斂', async () => {
  const result = await calculateMacd({ companyId: '2330' });

  assert.ok(result.asOfDate !== null);
  assert.ok(result.dif !== null, '2330 資料量足夠，DIF 應該算得出來');
  assert.ok(result.dem !== null, 'DIF 序列夠長，DEM 應該算得出來');
  assert.ok(result.osc !== null);
  assert.equal(Math.round((result.dif! - result.dem!) * 10000) / 10000, result.osc);
  assert.ok(result.dataCoverage.emaConverged, '2330 歷史約 1200 天，遠超過收斂門檻');
  assert.deepEqual(result.fieldStatuses, {});
});

test('macd: 資料量不足時回傳 null 並標成 no_data，不是拋錯', async () => {
  const result = await calculateMacd({ companyId: '1337' });
  if (result.dataCoverage.tradingDays < 26) {
    assert.equal(result.dif, null);
    assert.equal(result.dem, null);
    assert.equal(result.osc, null);
    assert.equal(result.fieldStatuses.dif?.status, 'no_data');
  }
});

test('macd: 9999（查無資料的公司）回傳 not_applicable', async () => {
  const result = await calculateMacd({ companyId: '9999' });
  assert.equal(result.asOfDate, null);
  assert.equal(result.dif, null);
  assert.equal(result.fieldStatuses.dif?.status, 'not_applicable');
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
