import { test, describe, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { runCompanyMetrics, CompanyMetricsValidationError } from '@/domainApi/companies/metricsService';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

describe('runCompanyMetrics', () => {
  test('已有快取的欄位直接回傳 source=cache，不觸發重算', async () => {
    // 2330 的 ROE 已經被批次算過（見 tests/domains/metrics/profitability/roe.test.ts 跟
    // 手動觸發過的 /batch/compute），這裡不特別造資料，驗證正常的 cache-hit 路徑。
    const result = await runCompanyMetrics('2330', ['roe.roeQuarterlyPct']);
    assert.equal(result.symbol, '2330');
    const value = result.values['roe.roeQuarterlyPct']!;
    assert.equal(value.source, 'cache');
    assert.ok(value.value !== null, '2330 應該查得到 ROE');
    assert.ok(value.asOfDate !== null);
  });

  test('cache miss 會委派 domainBatch 現算+upsert，回傳 source=computed，且 DB 真的多一列', async () => {
    // 刻意刪掉 2330 的 NissimPenmanRnoaResult，製造真正的 cache miss——刪掉之後這個測試自己會
    // 觸發重算把資料寫回去，不是破壞性操作（跟批次本來就會定期重算覆蓋是同一件事）。
    await analysisPrisma.nissimPenmanRnoaResult.deleteMany({ where: { symbol: '2330' } });
    const before = await analysisPrisma.nissimPenmanRnoaResult.findFirst({ where: { symbol: '2330' } });
    assert.equal(before, null, '刪除後應該確實查無資料，測試前提才成立');

    const result = await runCompanyMetrics('2330', ['nissimPenmanRnoa.rnoaQuarterlyPct']);
    const value = result.values['nissimPenmanRnoa.rnoaQuarterlyPct']!;
    assert.equal(value.source, 'computed');
    assert.ok(value.value !== null, '2330 有完整財報資料，應該算得出 RNOA');

    const after = await analysisPrisma.nissimPenmanRnoaResult.findFirst({ where: { symbol: '2330' } });
    assert.ok(after !== null, 'compute-on-miss 應該把結果 upsert 回 analysis 表');

    // 緊接著再查一次，這次應該是 cache hit。
    const second = await runCompanyMetrics('2330', ['nissimPenmanRnoa.rnoaQuarterlyPct']);
    assert.equal(second.values['nissimPenmanRnoa.rnoaQuarterlyPct']!.source, 'cache');
  });

  test('查無任何資料的公司，重算後仍是 null 時應該回傳 source=unavailable', async () => {
    // 9999 沒有股價資料，calculateBeta 查無重疊交易日時直接回傳、完全不 upsert（見
    // domainBatch/metrics/portfolio/beta/service.ts），是「重算後仍然沒有任何一列」的
    // 真實案例，不是刻意刪出來的——跟 roe 這種即使沒資料也可能因為 getLatestAvailableQuarter
    // 退回預設值而寫出一列的情況不同。
    const result = await runCompanyMetrics('9999', ['beta.beta1Y']);
    const value = result.values['beta.beta1Y']!;
    assert.equal(value.source, 'unavailable');
    assert.equal(value.value, null);
  });

  test('一次請求多個欄位，各自獨立判斷 cache/computed', async () => {
    await analysisPrisma.dupontResult.deleteMany({ where: { symbol: '2330' } });

    const result = await runCompanyMetrics('2330', ['roe.roeQuarterlyPct', 'dupont.decomposedRoeQuarterlyPct']);
    assert.equal(result.values['roe.roeQuarterlyPct']!.source, 'cache');
    assert.equal(result.values['dupont.decomposedRoeQuarterlyPct']!.source, 'computed');
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
