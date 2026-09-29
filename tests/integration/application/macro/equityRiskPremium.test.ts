import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateEquityRiskPremium } from '@/application/macro/equityRiskPremium/service';
import { appDeps } from '@/bootstrap/deps';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// TAIEX/公債殖利率都是逐日/逐月更新的活資料（不是季度財報那種固定快照），所以這裡不釘死確切數值，
// 只驗證「合理性」跟「結構」，避免資料每天更新就讓測試炸掉——跟 beta.test.ts 同一種理由。
test('equityRiskPremium: 不指定窗口，用完整重疊區間，算出的 ERP 落在合理範圍', async () => {
  const result = await calculateEquityRiskPremium({}, appDeps);

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
  const result = await calculateEquityRiskPremium({ startYear: 2021, startMonth: 9, endYear: 2026, endMonth: 6 }, appDeps);

  assert.equal(result.windowStart, '2021-09');
  assert.equal(result.windowEnd, '2026-06');
  assert.ok(result.months < 240);
  assert.ok(result.erpGeometric !== null, '短窗口仍然應該算出值，不是 null（服務不擋下短窗口計算，只警告）');
  assert.ok(
    result.warnings.some((w) => w.includes('可信度門檻')),
    '低於 240 個月的窗口應該出現可信度警告',
  );
});

// 2026-09-29 供給面模型（對照用）：通膨／GDP 用同一段窗口平均，殖利率取最新交易日上市公司市值加權。
test('equityRiskPremium: 供給面模型跟歷史法同窗口，輸入跟結果落在合理範圍', async () => {
  const result = await calculateEquityRiskPremium({}, appDeps);
  const s = result.supplySide;

  assert.ok(s !== null, '有重疊窗口時一定要有 supplySide');
  assert.ok(s.inflationMonths > 240 && s.gdpQuarters > 80, `窗口 ${result.windowStart}~${result.windowEnd} 應該涵蓋 20 年以上的 CPI／GDP`);
  assert.ok(s.expectedInflation !== null && s.expectedInflation > -2 && s.expectedInflation < 5, `台灣長期通膨 ${s.expectedInflation} 不在 -2%~5%`);
  assert.ok(s.realEarningsGrowth !== null && s.realEarningsGrowth > 0 && s.realEarningsGrowth < 10, `台灣長期實質成長 ${s.realEarningsGrowth} 不在 0%~10%`);
  assert.ok(s.riskFreeRate !== null && s.riskFreeRate > 0 && s.riskFreeRate < 10, `窗口終點 10 年期殖利率 ${s.riskFreeRate} 不在 0%~10%`);
  assert.equal(s.peGrowth, 0);
  // 測試 DB（SIT 分支，09-17 快照）的逐日市值只有少數公司——這正是防護要擋的情況：不能拿幾家公司的殖利率當大盤殖利率。
  if (s.dividendYield === null) {
    assert.equal(s.erp, null);
    assert.ok(result.warnings.some((w) => w.includes('無法算市值加權殖利率')), '殖利率算不出來時要說原因');
  } else {
    assert.ok(s.dividendYieldCompanyCount > 100 && s.dividendYieldMarketCapCoverage! > 80, '市值加權殖利率應該涵蓋大部分上市公司市值');
    assert.ok(s.erp !== null && s.erp > -5 && s.erp < 15, `供給面 ERP ${s.erp} 超出合理範圍`);
  }
});

test('equityRiskPremium: 指定超出資料涵蓋範圍的窗口時，會裁切並標記 clippedToAvailableData', async () => {
  const result = await calculateEquityRiskPremium({ startYear: 1900, startMonth: 1 }, appDeps);

  assert.equal(result.clippedToAvailableData, true);
  assert.ok(result.windowStart! >= '1994-12', '起始月應該被裁切到無風險利率資料涵蓋範圍內');
  assert.ok(result.warnings.some((w) => w.includes('已裁切到實際涵蓋範圍')));
});

test('equityRiskPremium: 窗口內重疊月份不足 2 個月時回傳 calculation_error，欄位為 null', async () => {
  // 用同一個月當起訖，重疊月份只有 1 個，不足以算出任何報酬率。
  const result = await calculateEquityRiskPremium({ startYear: 2020, startMonth: 1, endYear: 2020, endMonth: 1 }, appDeps);

  assert.equal(result.months, 1);
  assert.equal(result.erpGeometric, null);
  assert.equal(result.erpArithmetic, null);
  for (const field of ['marketReturnGeometric', 'marketReturnArithmetic', 'avgRiskFreeRate', 'erpGeometric', 'erpArithmetic']) {
    assert.equal(result.fieldStatuses[field]?.status, 'calculation_error');
  }
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await govExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
