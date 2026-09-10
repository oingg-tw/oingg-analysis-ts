import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';

// 2026-09-08 起改成直接掃描 src/domainPitMetrics/<分類>/<指標>/ 資料夾結構（見
// metricFolderCatalog.ts 的說明），取代舊架構手動維護的 filterCatalog.csv。
// 2026-09-10 端點路徑從 GET /filters 改名 GET /metrics——使用者判斷這支端點回的是
// 指標定義清單，不是篩選器本身，"filters" 這個名字跟實際內容不符，已通知 bff-ts/
// web-nuxt 這是 breaking change（路徑改名，回應形狀不變）。
// 2026-09-09 補上 displayName/unit（使用者可讀的中文名稱/單位）——之前這支端點沒有這批
// 文案，前端沒辦法直接拿來組欄位選單/顯示標籤，見 metricDefinitionRegistry.ts 每個
// metricCode 宣告的這兩個欄位。
// 2026-09-09 再移除四個 allowedXxx 陣列（原本對應 metricBasis.ts 的 periodType/
// lookbackRange/samplingInterval/snapshotCadence 四組概念，每個 metricCode 只會有
// 其中一組是真實值，其餘固定 ['N/A']）——bff-ts 早在拿到 validTokens 之後就已經完全
// 改讀這個欄位、不再碰那四個陣列（笛卡兒積會做出查不到資料的假選項，例如 beta 的
// 3x3=9 種組合只有 3 種真的有資料），既然沒有任何消費端還在用，直接把這個「四陣列並排」
// 的外部形狀從回應裡拿掉，只留 validTokens 當唯一該信任的合法 token 清單。
const metricFolderCatalogEntrySchema = z.object({
  metricCode: z.string().meta({ description: '對應 metricDefinitionRegistry.ts 的 key，也是 GET /companies/metric-history 等端點的 metricCode 參數值' }),
  displayName: z.string().meta({ description: '中文名稱，給前端直接顯示用（例如 "股東權益報酬率 (ROE)"）' }),
  unit: z.string().meta({ description: '單位（%、元、次、天、倍、分、無單位）' }),
  validTokens: z
    .array(z.string())
    .meta({
      description: '這個 metricCode 實際可查詢的 token 清單（screener field ".token" 後半段/companies 端點的 token 參數直接用這個值），組欄位選單請直接用這個陣列。',
    }),
  formulaLatex: z.string().optional().meta({
    description:
      '2026-09-10 新增：公式的 LaTeX 字串，前後端統一算式顯示用——後端儲存、前端忠實顯示，不要各自維護一份。' +
      '目前只在少數指標試點，還沒補上的是 undefined（不是空字串），前端請處理「這支指標還沒有公式可顯示」的情況，' +
      '繼續 fallback 顯示 displayName 就好。建議用 mathlive（唯讀模式）或 KaTeX 渲染。',
  }),
});

const metricFolderCatalogCategorySchema = z.object({
  categoryKey: z.string().meta({ description: '對應 src/domainPitMetrics/<categoryKey>/ 資料夾名稱' }),
  categoryDisplayName: z.string().meta({ description: '分類的中文名稱，給前端直接顯示用（例如 "獲利能力"）' }),
  metrics: z.array(metricFolderCatalogEntrySchema),
});

const filtersResultSchema = z.object({
  categories: z.array(metricFolderCatalogCategorySchema),
});

export const registerFiltersOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/metrics',
    summary: '列出目前 pitMetrics 底下已實作的指標，依因子分類分組',
    description:
      '直接掃描 src/domainPitMetrics/<分類>/<指標>/ 資料夾結構產生，不是手動維護的清單——每個資料夾嚴格對應一個獨立 metricCode。' +
      '分類（categoryKey）是 dividend/efficiency/growth/profitability/quality/resilience/valuation 之一，只列有指標的分類，' +
      '每個分類同時帶 categoryDisplayName（中文名稱），前端不用自己維護一份分類對照表。' +
      '每個 metric 有 metricCode/displayName（中文名稱）/unit（單位）/validTokens（這個 metricCode 實際可查詢的 token 清單，' +
      '直接拿來組欄位選單，不用前端自己組合或維護一份中文對照表）。可以拿 metricCode 直接打 GET /companies/metric-history、' +
      'GET /companies/metrics-history 查歷史數值。部分指標另外帶 formulaLatex（公式的 LaTeX 字串，前後端統一算式顯示用，' +
      '目前只在少數指標試點）。',
    tags: ['System'],
    responses: {
      200: {
        description: '分類 / 指標清單。',
        content: { 'application/json': { schema: filtersResultSchema } },
      },
    },
  });
};
