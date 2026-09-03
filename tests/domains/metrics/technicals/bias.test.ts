import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBiasIndicator } from '@/domainApi/metrics/technicals/bias/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

test('bias: 2330 歷史夠深，三個窗口都算得出合理範圍內的值', async () => {
  const result = await calculateBiasIndicator({ companyId: '2330' });

  assert.ok(result.asOfDate !== null);
  for (const key of ['bias5d', 'bias20d', 'bias60d'] as const) {
    const window = result[key];
    assert.ok(window.value !== null, `2330 資料量足夠，${key} 應該算得出來`);
    // 乖離率沒有理論上限，但單一個股短期內落在 -50%~50% 之外基本上代表算法出錯。
    assert.ok(window.value! > -50 && window.value! < 50, `${key}=${window.value} 數量級異常`);
  }
  assert.deepEqual(result.fieldStatuses, {});
});

test('bias: 資料量不足時回傳 null 並標成 no_data，不是拋錯', async () => {
  const result = await calculateBiasIndicator({ companyId: '1337' });
  if (result.dataCoverage.tradingDays < 60) {
    assert.equal(result.bias60d.value, null);
    assert.equal(result.fieldStatuses.bias60d?.status, 'no_data');
  }
});

test('bias: 9999（查無資料的公司）回傳 not_applicable', async () => {
  const result = await calculateBiasIndicator({ companyId: '9999' });
  assert.equal(result.asOfDate, null);
  for (const key of ['bias5d', 'bias20d', 'bias60d'] as const) {
    assert.equal(result[key].value, null);
    assert.equal(result.fieldStatuses[key]?.status, 'not_applicable');
  }
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
