import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMa } from '@/domains/metrics/technicals/ma/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 股價資料每天在更新，不釘死確切數值，只驗證合理性跟結構——跟 beta/altmanZScore 同一種測試風格。
test('ma: 2330 歷史夠深，六個窗口都算得出合理範圍內的值', async () => {
  const result = await calculateMa({ companyId: '2330' });

  assert.ok(result.asOfDate !== null);
  for (const key of ['ma5d', 'ma10d', 'ma20d', 'ma60d', 'ma120d', 'ma200d'] as const) {
    const window = result[key];
    assert.ok(window.value !== null, `2330 資料量足夠，${key} 應該算得出來`);
    assert.ok(window.value! > 0 && window.value! < 100000, `${key}=${window.value} 數量級異常`);
  }
  assert.deepEqual(result.fieldStatuses, {});
});

// 關鍵案例：資料量不足時不能拋錯，該回傳 null 加上原因，且不寫死是哪家公司「目前」資料不夠——
// 現查覆蓋率決定期望值，覆蓋率之後會持續成長。
test('ma: 資料量不足以計算長窗口時，該窗口回傳 null 並標成 no_data，不是拋錯', async () => {
  const result = await calculateMa({ companyId: '1337' });

  if (result.dataCoverage.tradingDays < 200) {
    assert.equal(result.ma200d.value, null);
    assert.equal(result.fieldStatuses.ma200d?.status, 'no_data');
  }
  // 不論資料多寡，回應結構都應該完整，不會因為某個窗口算不出來就整個壞掉。
  assert.ok('ma5d' in result && 'ma200d' in result);
});

test('ma: 9999（查無資料的公司）回傳 not_applicable，不是拋錯或裝作查得到', async () => {
  const result = await calculateMa({ companyId: '9999' });

  assert.equal(result.asOfDate, null);
  for (const key of ['ma5d', 'ma10d', 'ma20d', 'ma60d', 'ma120d', 'ma200d'] as const) {
    assert.equal(result[key].value, null);
    assert.equal(result.fieldStatuses[key]?.status, 'not_applicable');
  }
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
