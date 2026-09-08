import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';
import { periodTypeSchema, lookbackRangeSchema, samplingIntervalSchema, snapshotCadenceSchema } from '@/pitMetrics/metricBasis';

// 2026-09-08 起改成直接掃描 src/pitMetrics/<分類>/<指標>/ 資料夾結構（見
// metricFolderCatalog.ts 的說明），取代舊架構手動維護的 filterCatalog.csv——這份 schema
// 對應的是新的、簡化過的回應形狀：只有 categoryKey/metricCode/四個 allowedXxx 陣列，沒有
// 舊版 filterCatalog 那種手寫的 name/description/unit/aliases 使用者文案（那需要另外一批
// 寫作工作，不在這次範圍內）。四個陣列對應 metricBasis.ts 的四組概念（periodType/
// lookbackRange/samplingInterval/snapshotCadence，取代舊的單一 basis 欄位——那個名字違反
// ubiquitous language，「basis」在會計裡是保留字，不是這裡要表達的東西），每個 metricCode
// 只會有其中一組是真實值（超過 1 個元素），其餘固定 `['N/A']`。
const metricFolderCatalogEntrySchema = z.object({
  metricCode: z.string().meta({ description: '對應 metricDefinitionRegistry.ts 的 key，也是 GET /companies/metric-history 等端點的 metricCode 參數值' }),
  allowedPeriodTypes: z.array(periodTypeSchema).meta({ description: '季報型指標的期間聚合方式（Q/YTD/TTM/Q_ANN/FY）；非本組指標固定 ["N/A"]' }),
  allowedLookbackRanges: z.array(lookbackRangeSchema).meta({ description: '滾動統計量（Beta）的回溯範圍（1Y/2Y/5Y）；非本組指標固定 ["N/A"]' }),
  allowedSamplingIntervals: z.array(samplingIntervalSchema).meta({ description: '滾動統計量（Beta）的取樣粒度（1D/1W/1M）；非本組指標固定 ["N/A"]' }),
  allowedSnapshotCadences: z.array(snapshotCadenceSchema).meta({ description: '純市場快照的更新頻率（EOD）；非本組指標固定 ["N/A"]' }),
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
      '每個 metric 有 metricCode 跟四個 allowedXxx 陣列，只有其中一個會是真實值清單（超過 1 個元素），其餘固定 ["N/A"]——' +
      '每個 metricCode 只落在四組概念的其中一組：季報聚合方式（allowedPeriodTypes）、滾動統計量的回溯範圍/取樣粒度' +
      '（allowedLookbackRanges/allowedSamplingIntervals，目前只有 beta 使用，成對出現）、純市場快照更新頻率' +
      '（allowedSnapshotCadences）。可以拿 metricCode 直接打 GET /companies/metric-history、GET /companies/metrics-history ' +
      '查歷史數值——這支端點目前不提供使用者可讀的中文名稱/單位/公式說明（那批文案還沒有寫，是後續工作），純粹是給呼叫端' +
      '知道「目前有哪些指標可以查、每個指標接受哪些參數值」。',
    tags: ['System'],
    responses: {
      200: {
        description: '分類 / 指標清單。',
        content: { 'application/json': { schema: filtersResultSchema } },
      },
    },
  });
};
