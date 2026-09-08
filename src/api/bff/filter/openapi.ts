import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';
import { periodTypeSchema, lookbackRangeSchema, samplingIntervalSchema, snapshotCadenceSchema } from '@/pitMetrics/metricBasis';

// 2026-09-08 起改成直接掃描 src/pitMetrics/<分類>/<指標>/ 資料夾結構（見
// metricFolderCatalog.ts 的說明），取代舊架構手動維護的 filterCatalog.csv。四個
// allowedXxx 陣列對應 metricBasis.ts 的四組概念（periodType/lookbackRange/
// samplingInterval/snapshotCadence，取代舊的單一 basis 欄位——那個名字違反 ubiquitous
// language，「basis」在會計裡是保留字，不是這裡要表達的東西），每個 metricCode 只會有
// 其中一組是真實值（超過 1 個元素），其餘固定 `['N/A']`。
// 2026-09-09 補上 displayName/unit（使用者可讀的中文名稱/單位）——之前這支端點沒有這批
// 文案，前端沒辦法直接拿來組欄位選單/顯示標籤，見 metricDefinitionRegistry.ts 每個
// metricCode 宣告的這兩個欄位。
const metricFolderCatalogEntrySchema = z.object({
  metricCode: z.string().meta({ description: '對應 metricDefinitionRegistry.ts 的 key，也是 GET /companies/metric-history 等端點的 metricCode 參數值' }),
  displayName: z.string().meta({ description: '中文名稱，給前端直接顯示用（例如 "股東權益報酬率 (ROE)"）' }),
  unit: z.string().meta({ description: '單位（%、元、次、天、倍、分、無單位）' }),
  allowedPeriodTypes: z.array(periodTypeSchema).meta({ description: '季報型指標的期間聚合方式（Q/YTD/TTM/Q_ANN/FY）；非本組指標固定 ["N/A"]' }),
  allowedLookbackRanges: z.array(lookbackRangeSchema).meta({ description: '滾動統計量（Beta）的回溯範圍（1Y/2Y/5Y）；非本組指標固定 ["N/A"]' }),
  allowedSamplingIntervals: z.array(samplingIntervalSchema).meta({ description: '滾動統計量（Beta）的取樣粒度（1D/1W/1M）；非本組指標固定 ["N/A"]' }),
  allowedSnapshotCadences: z.array(snapshotCadenceSchema).meta({ description: '純市場快照的更新頻率（EOD）；非本組指標固定 ["N/A"]' }),
  validTokens: z
    .array(z.string())
    .meta({
      description:
        '這個 metricCode 實際可查詢的 token 清單（screener field ".token" 後半段/companies 端點的 token 參數直接用這個值）——' +
        '**不要**自己拿 allowedLookbackRanges x allowedSamplingIntervals 做笛卡兒積當選單，兩者不是自由交叉組合' +
        '（例如 beta 的 3x3=9 種組合裡只有 3 種真的有資料，其餘 6 種雖然格式合法但永遠查無資料），這個欄位才是唯一該信任的來源。',
    }),
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
      '（allowedLookbackRanges/allowedSamplingIntervals，目前只有 beta 使用）、純市場快照更新頻率（allowedSnapshotCadences）。' +
      '**組欄位選單請用 validTokens，不要自己對 allowedLookbackRanges/allowedSamplingIntervals 做笛卡兒積**——' +
      '這兩個陣列不是自由交叉組合，例如 beta 的 1Y/2Y/5Y x 1D/1W/1M 只有 3 種（1Y_1D/2Y_1W/5Y_1M）真的有資料，' +
      '其餘 6 種格式合法但永遠查無資料，validTokens 才是每個 metricCode 唯一該信任的合法 token 清單。可以拿' +
      'metricCode 直接打 GET /companies/metric-history、GET /companies/metrics-history ' +
      '查歷史數值。每個 metric 也帶 displayName（中文名稱）/unit（單位），可以直接拿來組欄位選單/顯示標籤，' +
      '不用前端自己維護一份中文對照表。',
    tags: ['System'],
    responses: {
      200: {
        description: '分類 / 指標清單。',
        content: { 'application/json': { schema: filtersResultSchema } },
      },
    },
  });
};
