import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';
import { metricBasisSchema } from '@/pitMetrics/metricBasis';

// 2026-09-08 起改成直接掃描 src/pitMetrics/<分類>/<指標>/ 資料夾結構（見
// metricFolderCatalog.ts 的說明），取代舊架構手動維護的 filterCatalog.csv——這份 schema
// 對應的是新的、簡化過的回應形狀：只有 categoryKey/metricCode/allowedBases，沒有舊版
// filterCatalog 那種手寫的 name/description/unit/aliases 使用者文案（那需要另外一批寫作
// 工作，不在這次範圍內）。
const metricFolderCatalogEntrySchema = z.object({
  metricCode: z.string().meta({ description: '對應 metricDefinitionRegistry.ts 的 key，也是 GET /companies/metric-history 等端點的 metricCode 參數值' }),
  allowedBases: z.array(metricBasisSchema).meta({ description: '這個指標實際支援哪些 basis（Q/Q_ANN/TTM/...），呼叫 metric-history 時只能傳這個清單裡的值' }),
});

const metricFolderCatalogCategorySchema = z.object({
  categoryKey: z.string().meta({ description: '對應 src/pitMetrics/<categoryKey>/ 資料夾名稱' }),
  metrics: z.array(metricFolderCatalogEntrySchema),
});

const filtersResultSchema = z.object({
  categories: z.array(metricFolderCatalogCategorySchema),
});

export const registerFiltersOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/filters',
    summary: '列出目前 pitMetrics 底下已實作的指標，依因子分類分組',
    description:
      '直接掃描 src/pitMetrics/<分類>/<指標>/ 資料夾結構產生，不是手動維護的清單——每個資料夾嚴格對應一個獨立 metricCode。' +
      '分類（categoryKey）是 dividend/efficiency/growth/profitability/quality/resilience/valuation 之一，只列有指標的分類。' +
      '每個 metric 只有 metricCode 跟 allowedBases（實際支援哪些 basis），可以拿 metricCode 直接打 ' +
      'GET /companies/metric-history、GET /companies/metrics-history 查歷史數值——這支端點目前不提供使用者可讀的' +
      '中文名稱/單位/公式說明（那批文案還沒有寫，是後續工作），純粹是給呼叫端知道「目前有哪些指標可以查」。',
    tags: ['System'],
    responses: {
      200: {
        description: '分類 / 指標清單。',
        content: { 'application/json': { schema: filtersResultSchema } },
      },
    },
  });
};
