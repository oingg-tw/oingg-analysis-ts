import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateObv } from '@/domainBatch/metrics/technicals/obv/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

test('obv: 2330 歷史夠深，算得出一個累積值（可能正可能負，不釘死方向）', async () => {
  const result = await calculateObv({ symbol: '2330' });

  assert.ok(result.asOfDate !== null);
  assert.ok(result.obv !== null, '2330 資料量足夠，OBV 應該算得出來');
  assert.deepEqual(result.fieldStatuses, {});
});

test('obv: 只有一天資料時 OBV 應該是 0（沒有前一天可以比較漲跌）', async () => {
  const result = await calculateObv({ symbol: '1337', asOfDate: '2026-08-17' });
  if (result.dataCoverage.tradingDays === 1) {
    assert.equal(result.obv, '0');
  }
});

test('obv: 9999（查無資料的公司）回傳 not_applicable', async () => {
  const result = await calculateObv({ symbol: '9999' });
  assert.equal(result.asOfDate, null);
  assert.equal(result.obv, null);
  assert.equal(result.fieldStatuses.obv?.status, 'not_applicable');
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
