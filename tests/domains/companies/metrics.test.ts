import { test, describe, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { runCompanyMetrics, CompanyMetricsValidationError } from '@/api/bff/companies/metricsService';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

describe('runCompanyMetrics', () => {
  // 2026-09-07：使用者要求把舊架構 34 張「單一指標一張表」的 Result 表全部 DROP（這批全部
  // 已經有 pitMetrics 版本可查）——原本這幾個測試用的 roe/dupont/nissimPenmanRnoa/
  // netDebtToEbitda 都已經不存在了。這個模組（GET /companies/metrics 的 compute-on-miss）
  // 現在只剩兩個倖存的舊架構家族可以拿來驗證：beta（BetaResult）、marketRatios
  // （MarketRatiosResult，metricKey per/pbr/dividendYield 三個都指回同一張表/同一列）。

  test('已有快取的欄位直接回傳 source=cache，不觸發重算', async () => {
    // 2330 的 marketRatios 已經被每日批次算過，這裡不特別造資料，驗證正常的 cache-hit 路徑。
    const result = await runCompanyMetrics('2330', ['per.peRatio']);
    assert.equal(result.symbol, '2330');
    const value = result.values['per.peRatio']!;
    assert.equal(value.source, 'cache');
    assert.ok(value.value !== null, '2330 應該查得到本益比');
    assert.ok(value.asOfDate !== null);
  });

  test('cache miss 會委派 api/batch 現算+upsert，回傳 source=computed，且 DB 真的多一列', async () => {
    // 刻意刪掉 2330 的 BetaResult，製造真正的 cache miss——刪掉之後這個測試自己會觸發重算
    // 把資料寫回去，不是破壞性操作（跟批次本來就會定期重算覆蓋是同一件事）。
    await analysisPrisma.betaResult.deleteMany({ where: { symbol: '2330' } });
    const before = await analysisPrisma.betaResult.findFirst({ where: { symbol: '2330' } });
    assert.equal(before, null, '刪除後應該確實查無資料，測試前提才成立');

    const result = await runCompanyMetrics('2330', ['beta.beta1Y']);
    const value = result.values['beta.beta1Y']!;
    assert.equal(value.source, 'computed');
    assert.ok(value.value !== null, '2330 有完整股價資料，應該算得出 Beta');

    const after = await analysisPrisma.betaResult.findFirst({ where: { symbol: '2330' } });
    assert.ok(after !== null, 'compute-on-miss 應該把結果 upsert 回 analysis 表');

    // 緊接著再查一次，這次應該是 cache hit。
    const second = await runCompanyMetrics('2330', ['beta.beta1Y']);
    assert.equal(second.values['beta.beta1Y']!.source, 'cache');
  });

  test('查無任何資料的公司，重算後仍是 null 時應該回傳 source=unavailable', async () => {
    // 9999 沒有股價資料，calculateBeta 查無重疊交易日時直接回傳、完全不 upsert（見
    // domainMetrics/beta.ts），是「重算後仍然沒有任何一列」的真實案例，不是刻意刪出來的。
    const result = await runCompanyMetrics('9999', ['beta.beta1Y']);
    const value = result.values['beta.beta1Y']!;
    assert.equal(value.source, 'unavailable');
    assert.equal(value.value, null);
  });

  test('一次請求多個欄位，各自獨立判斷 cache/computed', async () => {
    // per/pbr/dividendYield 三個 metricKey 共用同一張 MarketRatiosResult 表/同一列，
    // 沒辦法拿來做「同一次請求裡一個 cache 一個 computed」的對照——這裡改成 beta（先刪造
    // miss）跟 per（維持既有快取）兩個不同表的組合。
    await analysisPrisma.betaResult.deleteMany({ where: { symbol: '2330' } });

    const result = await runCompanyMetrics('2330', ['per.peRatio', 'beta.beta1Y']);
    assert.equal(result.values['per.peRatio']!.source, 'cache');
    assert.equal(result.values['beta.beta1Y']!.source, 'computed');
  });

  test('field 格式錯誤（缺少 "."）應該拋 CompanyMetricsValidationError', async () => {
    await assert.rejects(() => runCompanyMetrics('2330', ['roeQuarterlyPct']), CompanyMetricsValidationError);
  });

  test('obv 目前不支援單一公司查詢，應該拋 CompanyMetricsValidationError', async () => {
    await assert.rejects(() => runCompanyMetrics('2330', ['obv.obv']), CompanyMetricsValidationError);
  });

  test('equityRiskPremium/govBondYield10y 是全市場單一值，不支援單一公司查詢，應該拋 CompanyMetricsValidationError', async () => {
    await assert.rejects(() => runCompanyMetrics('2330', ['equityRiskPremium.erpGeometric']), CompanyMetricsValidationError);
    await assert.rejects(() => runCompanyMetrics('2330', ['govBondYield10y.yieldPct']), CompanyMetricsValidationError);
  });
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
  await mopsExportPrisma.$disconnect();
});
