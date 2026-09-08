import { test, describe, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { runCompanyMetrics, CompanyMetricsValidationError } from '@/api/bff/companies/metricsService';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// 2026-09-08：filterCatalog.csv 最後 6 列（beta/marketRatios）退場，CSV 現在只剩
// header、0 筆資料列——這個模組（GET /companies/metrics 的 compute-on-miss）背後仰賴的
// filterCatalog 已經沒有任何可查詢的欄位了。跟先前每一批退場（34 張表那次）不同的是，
// 這次沒有任何倖存的舊架構欄位可以拿來當「cache/computed/unavailable 各種情境」的
// 真實案例——所以這個檔案不再驗證任何具體指標的行為，改成驗證「catalog 是空的時候，
// 任何欄位查詢都正確判定成未知欄位」這個空目錄行為本身。程式碼（metricsService.ts）
// 刻意保留、不刪除，之後 pitMetrics 版 screener 若要做，這裡是可以直接復用的骨架，
// 見 abstract-crafting-journal.md「pitMetrics 版 screener 替代方案：工作量評估」。

describe('runCompanyMetrics', () => {
  test('filterCatalog 是空的，任何欄位查詢都應該拋 CompanyMetricsValidationError（未知欄位），不是 500 或靜默回傳 null', async () => {
    await assert.rejects(() => runCompanyMetrics('2330', ['beta.beta1Y']), CompanyMetricsValidationError);
    await assert.rejects(() => runCompanyMetrics('2330', ['per.peRatio']), CompanyMetricsValidationError);
    await assert.rejects(() => runCompanyMetrics('9999', ['roe.roeQuarterlyPct']), CompanyMetricsValidationError);
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
