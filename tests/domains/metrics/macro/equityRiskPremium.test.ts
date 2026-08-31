import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEquityRiskPremium } from '@/domains/metrics/macro/equityRiskPremium/service';
import twsePrisma from '@/adapters/prisma/twseClient';
import govPrisma from '@/adapters/prisma/govClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// TAIEX/公債殖利率都是逐日/逐月更新的活資料（不是季度財報那種固定快照），所以這裡不釘死確切數值，
// 只驗證「合理性」跟「結構」，避免資料每天更新就讓測試炸掉——跟 beta.test.ts 同一種理由。
test('equityRiskPremium: 不指定窗口，用完整重疊區間，算出的 ERP 落在合理範圍', async () => {
  const result = await calculateEquityRiskPremium({});

  assert.ok(result.windowStart !== null && result.windowEnd !== null, '應該要有可用的重疊區間');
  assert.ok(result.months > 240, '完整歷史窗口目前應該已經超過 20 年（240 個月）');
  assert.deepEqual(result.fieldStatuses, {}, '資料齊全，不應該有任何 fieldStatuses 項目');
  // 長窗口不應該再出現「可信度不足」警告（門檻是 240 個月），但仍可能有其他無關警告，所以只檢查沒有那句特定文字。
  assert.ok(
    !result.warnings.some((w) => w.includes('可信度門檻')),
    '窗口已經超過可信度門檻，不應該出現可信度警告',
  );

  // ERP 沒有理論上限，但長窗口（>20年）算出來離譜到兩位數以上基本上代表算法出錯或資料異常，不是正常的市場風險溢酬。
  assert.ok(result.erpGeometric !== null && result.erpGeometric > -20 && result.erpGeometric < 20, `erpGeometric ${result.erpGeometric} 超出合理範圍`);
  assert.ok(result.erpArithmetic !== null && result.erpArithmetic > -20 && result.erpArithmetic < 20, `erpArithmetic ${result.erpArithmetic} 超出合理範圍`);
  // 算術平均理論上一定 >= 幾何平均（Jensen 不等式，報酬率有波動時嚴格大於）。
  assert.ok(result.marketReturnArithmetic! >= result.marketReturnGeometric!, '算術年化報酬率應該 >= 幾何年化報酬率');
});

test('equityRiskPremium: 指定短窗口時會算出結果，但帶可信度警告', async () => {
  const result = await calculateEquityRiskPremium({ startYear: 2021, startMonth: 9, endYear: 2026, endMonth: 6 });

  assert.equal(result.windowStart, '2021-09');
  assert.equal(result.windowEnd, '2026-06');
  assert.ok(result.months < 240);
  assert.ok(result.erpGeometric !== null, '短窗口仍然應該算出值，不是 null（服務不擋下短窗口計算，只警告）');
  assert.ok(
    result.warnings.some((w) => w.includes('可信度門檻')),
    '低於 240 個月的窗口應該出現可信度警告',
  );
});

test('equityRiskPremium: 指定超出資料涵蓋範圍的窗口時，會裁切並標記 clippedToAvailableData', async () => {
  const result = await calculateEquityRiskPremium({ startYear: 1900, startMonth: 1 });

  assert.equal(result.clippedToAvailableData, true);
  assert.ok(result.windowStart! >= '1994-12', '起始月應該被裁切到無風險利率資料涵蓋範圍內');
  assert.ok(result.warnings.some((w) => w.includes('已裁切到實際涵蓋範圍')));
});

test('equityRiskPremium: 窗口內重疊月份不足 2 個月時回傳 calculation_error，欄位為 null', async () => {
  // 用同一個月當起訖，重疊月份只有 1 個，不足以算出任何報酬率。
  const result = await calculateEquityRiskPremium({ startYear: 2020, startMonth: 1, endYear: 2020, endMonth: 1 });

  assert.equal(result.months, 1);
  assert.equal(result.erpGeometric, null);
  assert.equal(result.erpArithmetic, null);
  for (const field of ['marketReturnGeometric', 'marketReturnArithmetic', 'avgRiskFreeRate', 'erpGeometric', 'erpArithmetic']) {
    assert.equal(result.fieldStatuses[field]?.status, 'calculation_error');
  }
});

after(async () => {
  await twsePrisma.$disconnect();
  await govPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
