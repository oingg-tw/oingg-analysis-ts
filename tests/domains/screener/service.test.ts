import { test, describe, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { runScreener, runScreenerRanking, runScreenerValues, ScreenerValidationError } from '@/api/bff/screener/service';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2026-09-08：filterCatalog.csv 最後 6 列（beta/marketRatios）退場，CSV 現在只剩
// header、0 筆資料列——這代表 filterCatalog 驅動的 screener 功能（GET /screener 系列）
// 已經沒有任何真實可查詢的欄位了，不只是這個測試檔案先前用來當道具的 beta/marketRatios
// 消失而已。跟先前每一批退場不同，這次沒有任何倖存欄位可以拿來做「真的篩得出資料」的
// 整合測試，這個檔案改成驗證「catalog 是空的時候，任何欄位查詢都正確判定成未知欄位」這個
// 空目錄行為本身，以及幾個完全不依賴 catalog 內容、純結構性的驗證規則（filters/columns
// 皆空、sortField 缺 sortOrder 等）仍然正常運作。程式碼（service.ts/queryBuilder.ts/
// metricTableRegistry.ts）刻意保留、不刪除，之後 pitMetrics 版 screener 若要做，這裡是
// 可以直接復用的骨架，見 abstract-crafting-journal.md「pitMetrics 版 screener 替代方案：
// 工作量評估」。

const baseRequest = { filters: [] as { field: string; min: number | null; max: number | null; exclude?: boolean }[], columns: [] as { field: string }[], page: 1, pageSize: 50 };

describe('runScreener', () => {
  test('filterCatalog 是空的，任何欄位當 filter 或 column 都應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener({ ...baseRequest, filters: [{ field: 'beta.beta1Y', min: 0, max: null }] }), ScreenerValidationError);
    await assert.rejects(() => runScreener({ ...baseRequest, columns: [{ field: 'per.peRatio' }] }), ScreenerValidationError);
  });

  test('查不到的 field 應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreener({ ...baseRequest, filters: [{ field: 'notARealMetric.x', min: 1, max: 2 }] }), ScreenerValidationError);
  });

  test('filters 跟 columns 都是空的應該拋 ScreenerValidationError（跟 catalog 內容無關的純結構性驗證）', async () => {
    await assert.rejects(() => runScreener(baseRequest), ScreenerValidationError);
  });

  // resolveSort（sortField 缺 sortOrder 的規則）在 filters/columns 都解析成功之後才會執行
  // ——catalog 是空的之後，任何 filters/columns 只要非空就會先在欄位解析階段拋錯，這條規則
  // 因此變成暫時無法從外部觸發的死路徑，不是被移除，等 pitMetrics 版 screener 有真實欄位
  // 可用時這條規則會自然恢復可測。
});

describe('runScreenerRanking', () => {
  test('filterCatalog 是空的，排序欄位查不到應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreenerRanking({ field: 'beta.beta1Y', direction: 'desc', limit: 5, columns: [] }), ScreenerValidationError);
  });
});

describe('runScreenerValues', () => {
  test('symbols 是空陣列、columns 也是空陣列應該回傳空結果，不拋錯（不會走到欄位解析）', async () => {
    const result = await runScreenerValues({ symbols: [], columns: [] });
    assert.deepEqual(result.results, []);
  });

  test('filterCatalog 是空的，任何 column 欄位都應該拋 ScreenerValidationError，即使 symbols 是空陣列——欄位解析發生在檢查 symbols 是否為空之前', async () => {
    await assert.rejects(() => runScreenerValues({ symbols: [], columns: [{ field: 'beta.beta1Y' }] }), ScreenerValidationError);
  });

  test('查不到的 field 應該拋 ScreenerValidationError', async () => {
    await assert.rejects(() => runScreenerValues({ symbols: ['2330'], columns: [{ field: 'notARealMetric.x' }] }), ScreenerValidationError);
  });
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
});
