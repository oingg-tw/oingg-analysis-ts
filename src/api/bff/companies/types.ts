import { z } from 'zod';
import { companyNameEntrySchema } from '@/shared/sourceData/companyProfile';

// 2026-09-05 起改成 zod schema 當唯一真理來源，TypeScript 型別用 z.infer 反推——原本這裡是
// 純 TypeScript interface，跟 Swagger 文件（原本手寫 JSDoc）是兩份要手動保持同步的東西，
// 改用 @asteasolutions/zod-to-openapi 之後，回應形狀跟文件直接共用同一個 schema，改一個地方兩邊都會跟著更新。
// .meta() 帶的 description 就是 Swagger 文件會顯示的欄位說明，取代原本寫在 JSDoc 裡的敘述。

// 2026-09-02 應 bff-ts 要求新增（個股詳情頁的公司基本資料卡片）——欄位清單直接照他們給的
// camelCase 名稱，bigint 欄位（paidInCapital/issuedShares/...）序列化成 string，跟本服務
// 其他大數字欄位（例如 revenueRanking 的 currentMonthRevenue）同樣的慣例，避免 JS 數字精度問題。
export const companyProfileDetailSchema = z.object({
  symbol: z.string().meta({ description: '公司代號' }),
  market: z.enum(['TWSE', 'TPEx']).meta({ description: '上市（TWSE）或上櫃（TPEx）' }),
  reportDate: z.string().nullable(),
  name: z.string().nullable(),
  shortName: z.string().nullable(),
  foreignRegistrationCountry: z.string().nullable(),
  industry: z.string().nullable().meta({ description: '產業裸代碼，例如 "24"，前端顯示請用 industryName' }),
  // 2026-09-02 應 bff-ts/web-nuxt 要求新增——industry 是裸代碼（例如 "24"），前端顯示沒意義。
  // TWSE company_profile 本身就有這個欄位（例如 "半導體業"），直接透傳；TPEx 的 export view
  // 沒有對應欄位，這邊先回 null，已經去信請 tpex-ts 評估補上（見對話紀錄），避免自己猜代碼
  // 對照表猜錯——bff-ts 明確要求「有官方對照表才給，不要亂猜」。
  industryName: z.string().nullable().meta({ description: '可讀產業名稱；TPEx 目前沒有對應欄位，一律是 null，不是猜出來的代碼對照' }),
  address: z.string().nullable(),
  taxId: z.string().nullable(),
  chairman: z.string().nullable(),
  generalManager: z.string().nullable(),
  spokesperson: z.string().nullable(),
  spokespersonTitle: z.string().nullable(),
  deputySpokesperson: z.string().nullable(),
  phone: z.string().nullable(),
  establishedDate: z.string().nullable(),
  listedDate: z.string().nullable(),
  parValue: z.number().nullable(),
  paidInCapital: z.string().nullable().meta({ description: 'BigInt 序列化成字串，避免 JS 數字精度問題' }),
  privatePlacementShares: z.string().nullable(),
  preferredStockShares: z.string().nullable(),
  financialReportType: z.string().nullable().meta({ description: '財報類型裸代碼（"1"/"2"），前端顯示請用 financialReportTypeName' }),
  // 2026-09-02 應 bff-ts/web-nuxt 要求新增——financialReportType 是裸代碼（"1"/"2"），前端顯示
  // 沒意義。MOPS 沒有公開的欄位字典，這個對照是跟 mops-ts 確認過的（他們專案內部從三表 domain
  // 開始就用同一套慣例：dataType '1'=個體/個別財報、'2'=合併財報，且用另一個 MOPS 端點
  // t164sb01 的 REPORT_ID 參數 'A'（個別）/'C'（合併）交叉印證過，信心度高但不是白紙黑字的
  // 官方文件），跟 industryName 一樣是本服務自己解出來的可讀名稱，不是 company_profile 原始欄位。
  financialReportTypeName: z.string().nullable().meta({ description: '目前只會是「個別財報」或「合併財報」，未知代碼回 null' }),
  stockTransferAgency: z.string().nullable(),
  transferAgencyPhone: z.string().nullable(),
  transferAgencyAddress: z.string().nullable(),
  auditingFirm: z.string().nullable(),
  auditor1: z.string().nullable(),
  auditor2: z.string().nullable(),
  englishShortName: z.string().nullable(),
  englishAddress: z.string().nullable(),
  faxNumber: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable().meta({ description: '2026-09-04 起已正規化成裸網域（去 scheme/尾斜線/www. 前綴），方便直接接 logo 服務' }),
  issuedShares: z.string().nullable(),
});
export type CompanyProfileDetail = z.infer<typeof companyProfileDetailSchema>;

// 2026-09-04 新增——api/bff「讀取優先」consolidated 查詢 API 的回應形狀。
// source 區分「本來就有快取」跟「這次請求觸發現算補上」，方便驗證 compute-on-miss
// 是否真的有作用，也對之後除錯有幫助。
export const companyMetricValueSchema = z.object({
  value: z.number().nullable(),
  asOfDate: z.string().nullable(),
  source: z.enum(['cache', 'computed', 'unavailable']).meta({
    description: 'cache=已有快取直接回傳；computed=查無快取，這次請求觸發現算並寫回；unavailable=現算後仍然沒有資料',
  }),
});
export type CompanyMetricValue = z.infer<typeof companyMetricValueSchema>;

export const companyMetricsResultSchema = z.object({
  symbol: z.string(),
  values: z.record(z.string(), companyMetricValueSchema).meta({ description: 'key 是請求時的 "metricKey.fieldKey"，每個要求的 field 都保證出現' }),
});
export type CompanyMetricsResult = z.infer<typeof companyMetricsResultSchema>;

// 2026-09-01 應 bff-ts 要求新增的 GET /companies 兩種回應形狀（依 countOnly 決定回哪一種）。
export const companiesListResultSchema = z.object({
  count: z.number().meta({ description: '全部公司總筆數（不受 limit/offset 影響）' }),
  limit: z.number(),
  offset: z.number(),
  entries: z.array(companyNameEntrySchema),
});
export type CompaniesListResult = z.infer<typeof companiesListResultSchema>;

export const companiesCountOnlyResultSchema = z.object({
  count: z.number().meta({ description: '全部公司總筆數' }),
});
export type CompaniesCountOnlyResult = z.infer<typeof companiesCountOnlyResultSchema>;

// 2026-09-05 新增——「產業同業比較」功能，見 src/shared/sourceData/industryClassification.ts。
export const companyPeerEntrySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
});

export const companyPeerGroupResultSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  found: z.boolean().meta({ description: 'false 代表查無產業分類資料（見 warnings 是否有 KY 股提示），其餘欄位皆為 null/空陣列' }),
  industryLevel: z.enum(['subclass', 'class', 'group', 'division']).nullable().meta({ description: '這次比較實際使用的分類層級（子類/細類/小類/中類），由動態回退演算法決定' }),
  industryCode: z.string().nullable(),
  industryName: z.string().nullable(),
  peers: z.array(companyPeerEntrySchema).meta({ description: '同業清單，含目標公司自己；只有代號跟名稱，指標數值請另外呼叫 POST /screener/values' }),
  warnings: z.array(z.string()),
});
export type CompanyPeerGroupResult = z.infer<typeof companyPeerGroupResultSchema>;

// 2026-09-06 新增——「會計模式」單一公司單張財報表查詢（資產負債表/損益表/現金流量表整列
// 透傳，不是算好的比率），見 controller.ts 的 getCompanyFinancialStatement。
export const financialStatementResultSchema = z.object({
  symbol: z.string(),
  statementType: z.enum(['balanceSheet', 'incomeStatement', 'cashFlowStatement']),
  dataType: z.enum(['1', '2']),
  subsidiaryCompanyId: z.string(),
  year: z.string().nullable().meta({ description: '民國年，例如 "115"；查無資料時為 null' }),
  season: z.string().nullable(),
  reportDate: z.string().nullable(),
  found: z.boolean().meta({ description: 'false 代表查無該公司這張表的資料（或指定的 year/season 那一季查無資料），此時 statement 為 null' }),
  statement: z
    .record(z.string(), z.string().nullable())
    .nullable()
    .meta({ description: '該表全部科目欄位（camelCase key），金額欄位皆序列化成字串避免 JS 數字精度問題；found=false 時為 null' }),
});
export type FinancialStatementResult = z.infer<typeof financialStatementResultSchema>;
