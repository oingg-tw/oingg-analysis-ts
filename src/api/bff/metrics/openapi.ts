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
// 其中一組是真實值，其餘固定 ['N/A']）——bff-ts 早在拿到 validTimeframes 之後就已經完全
// 改讀這個欄位、不再碰那四個陣列（笛卡兒積會做出查不到資料的假選項，例如 beta 的
// 3x3=9 種組合只有 3 種真的有資料），既然沒有任何消費端還在用，直接把這個「四陣列並排」
// 的外部形狀從回應裡拿掉，只留 validTimeframes 當唯一該信任的合法 timeframe 清單。
const metricFolderCatalogEntrySchema = z.object({
  metricCode: z.string().meta({ description: '對應 metricDefinitionRegistry.ts 的 key，也是 GET /companies/metric-history 等端點的 metricCode 參數值' }),
  name: z.string().meta({ description: '中文名稱，給前端直接顯示用（例如 "股東權益報酬率 (ROE)"）' }),
  nameSuffix: z.string().optional().meta({
    description:
      '2026-09-11 新增：跟 name 平行的補充資訊（例如「即時」，標示 liveGrahamNumber 這類逐日型指標' +
      '跟同名季報型指標的差異），前端可以用小字/副標籤另外呈現，不會被塞進 name 本身的括號附註。' +
      '選填，沒有補充資訊時是 undefined（不是空字串）。',
  }),
  nameEn: z.string().optional().meta({
    description: '2026-09-12 新增：英文名稱，目前只有原本 15 支大師徽章指標有值，其餘還沒補，選填，沒有時是 undefined（不是空字串）。',
  }),
  unit: z.string().meta({ description: '單位（%、元、次、天、倍、分、無單位）' }),
  validTimeframes: z
    .array(z.string())
    .meta({
      description: '這個 metricCode 實際可查詢的 timeframe 清單（screener field ".timeframe" 後半段/companies 端點的 timeframe 參數直接用這個值），組欄位選單請直接用這個陣列。',
    }),
  formulaLatex: z.string().optional().meta({
    description:
      '2026-09-10 新增：公式的 LaTeX 字串，前後端統一算式顯示用——後端儲存、前端忠實顯示，不要各自維護一份。' +
      '目前只在少數指標試點，還沒補上的是 undefined（不是空字串），前端請處理「這支指標還沒有公式可顯示」的情況，' +
      '繼續 fallback 顯示 name 就好。建議用 mathlive（唯讀模式）或 KaTeX 渲染。',
  }),
  academicSourceUrl: z.string().optional().meta({
    description:
      '2026-09-10 新增：這個公式/模型本身的學術出處連結（作者/年份/論文），只有真的有單一可指名論文出處的' +
      '大師模型/複合指標才有值（Altman Z 系列、Piotroski F-Score、Beneish M-Score、Ohlson O-Score、' +
      'Zmijewski Score 等），一般會計比率（ROE/流動比率這類教科書等級的通用比率）沒有單一論文出處，這個' +
      '欄位是 undefined，不是空字串。前端當作「查原始論文」的連結顯示。',
  }),
  referenceUrl: z.string().optional().meta({
    description:
      '2026-09-10 新增：給終端使用者查證「這個指標的定義/算法」用的公開參考頁面連結（例如維基百科），' +
      '大師模型可能同時有 academicSourceUrl 跟 referenceUrl（一個給想找原始論文的人，一個給一般讀者看的' +
      '白話解釋）。選填，還沒補上的是 undefined。',
  }),
  tier: z.enum(['raw', 'derived', 'composite']).meta({
    description:
      '2026-09-10 新增：計算複雜度分層，跟 categoryKey（因子主題分類）正交，必填。"raw" = 完全不計算的' +
      'passthrough（交易所公告數字、mops-ts 已經算好的銀行監理比率）；"derived" = 基本財報數字的單一比率' +
      '（ROE/流動比率這類教科書等級的通用比率，即使背後有學術淵源也算這層，只要算式本身是單一比率）；' +
      '"composite" = 多因子模型/統計方法論（Altman Z/Piotroski/Beneish/Ohlson/Zmijewski 這些大師評分模型、' +
      'Graham Number/NCAV、DuPont 拆解版 ROE、SGR/Chowder Number、SUE、beta）。',
  }),
  sources: z.array(z.string()).meta({
    description:
      '2026-09-10 新增：這支指標實際依賴的真實資料來源（例如 "公開發行公司資產負債表（XBRL）"），必填，' +
      '不會是 undefined。不是從 dependsOn 推導——dependsOn 沒有執行期消費者，只是文件性欄位，可能跟真實' +
      '計算邏輯脫節；這裡的值是逐一追蹤每支指標實際計算檔案（很多指標是共用的 family orchestrator 算出來' +
      '的，不是自己資料夾裡那個檔案）真正查詢的資料表人工核對過的結果。用固定的一組中文標籤，同一個標籤' +
      '字串在不同指標間逐字重複使用，前端可以直接拿字串本身當分組/比對依據。',
  }),
  badge: z
    .object({
      name: z.string(),
      nameSuffix: z.string().optional().meta({ description: '徽章名稱的補充限定語（例如「非上市公司版」），目前沒有任何徽章使用，保留給未來' }),
      nameEn: z.string(),
      author: z.string().meta({ description: '法則/門檻的提出者或出處機構，例如 "Edward Altman, 1968"' }),
      summary: z.string(),
      detail: z.string(),
      timeframe: z.string().optional().meta({
        description:
          '這支指標本身要用哪個 timeframe 讀值來套用這個門檻（例如 "TTM"），是這支 metricCode 的 validTimeframes 之一。' +
          'threshold.allPositiveFieldIds 情境下已經自帶完整 "metricCode.timeframe" 字串，這個欄位留空。',
      }),
      threshold: z.object({
        description: z.string().meta({ description: '人類可讀的門檻說明（只有門檻本身，例如 "> 2.99"），不含括號附註，補充說明見 note' }),
        thresholdLatex: z.string().meta({ description: '門檻的 LaTeX 數學式呈現（例如 "\\mathrm{Z} > 2.99"），跟 formulaLatex 同一套 compute-engine 驗證機制，符號盡量跟該指標自己的 formulaLatex 一致' }),
        note: z.string().optional().meta({ description: '門檻的出處/限制/跟原論文差異等補充說明，跟 description 分開存放；沒有補充說明時省略' }),
        denominator: z.number().meta({ description: '目前全部是 1（單一比較）' }),
        comparator: z.enum(['gt', 'lt', 'gte', 'abs_lt', 'in_range']).optional(),
        value: z.number().optional().meta({ description: '固定常數比較時使用（comparator 不是 in_range 的情況）' }),
        valueMin: z.number().optional().meta({ description: 'comparator 是 in_range 時的區間下限（例如 dividendPayoutRatio 是 40）' }),
        valueMax: z.number().optional().meta({ description: 'comparator 是 in_range 時的區間上限（例如 dividendPayoutRatio 是 60）' }),
        compareAgainstFieldId: z.string().optional().meta({
          description: '格式 "metricCode.timeframe"，語意是「這個欄位的值 {comparator} 這支指標自己的值」（例如 Graham Number 是「股價 < Graham Number」）',
        }),
        allPositiveFieldIds: z.array(z.string()).optional().meta({ description: '格式同上，多個欄位，語意是「全部都要 > 0」' }),
      }),
    })
    .optional()
    .meta({
      description:
        '2026-09-10 新增：web-nuxt 原本在前端手工維護的「大師徽章」資料（命名法則/門檻/引用出處）搬過來。' +
        '2026-09-14 來源改成獨立的 badgeRegistry.ts，不是塞在指標定義本身，形狀不變。只有部分指標有，' +
        '其餘指標這個欄位是 undefined。',
    }),
  hasProvenance: z.boolean().meta({
    description:
      '2026-09-13 新增：這支 metricCode 是否支援 GET /companies/:symbol/metric-provenance' +
      '（稽核鏈/原始欄位溯源）——目前只有一批試點指標支援，範圍會逐批擴大，前端應該讀這個' +
      '欄位動態決定要不要顯示「查看稽核鏈」的入口，不要自己另外維護一份 metricCode 清單' +
      '（那份清單只會跟這裡的擴大進度脫節）。必填，不會是 undefined。',
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
      '每個 metric 有 metricCode/name（中文名稱）/unit（單位）/validTimeframes（這個 metricCode 實際可查詢的 timeframe 清單，' +
      '直接拿來組欄位選單，不用前端自己組合或維護一份中文對照表）。可以拿 metricCode 直接打 GET /companies/metric-history、' +
      'GET /companies/metrics-history 查歷史數值。部分指標另外帶 formulaLatex（公式的 LaTeX 字串，前後端統一算式顯示用，' +
      '目前只在少數指標試點）、academicSourceUrl（學術論文出處連結，只有大師模型有）、referenceUrl（給終端使用者查證用的' +
      '公開參考頁面，例如維基百科）、tier（raw/derived/composite 三層計算複雜度分層，必填）、badge（大師徽章資料，' +
      '只有部分指標有）。',
    tags: ['System'],
    responses: {
      200: {
        description: '分類 / 指標清單。',
        content: { 'application/json': { schema: filtersResultSchema } },
      },
    },
  });
};
