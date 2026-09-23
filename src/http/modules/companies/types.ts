import { z } from 'zod';
import type { CompanyNameEntry } from '@/application/ports/companyProfiles';
import type { CapitalStockChangeSource, CapitalStockHistoryEntry } from '@/application/ports/capitalStock';
import type { MonthlyRevenueEntry } from '@/application/ports/monthlyRevenue';
import type { CompanyProfileDetail } from '@/application/companies/types';
import type { DividendHistoryEntry, DividendHistoryEvent } from '@/application/companies/dividendHistory';

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
  financialReportType: z.string().nullable().meta({ description: '交易所「編製財務報告類型」裸代碼："1" 合併財報、"2" 個別財報（注意跟 MOPS dataType 相反）；前端顯示請用 financialReportTypeName，判斷指標口徑請用 metricDataType' }),
  // 2026-09-02 應 bff-ts/web-nuxt 要求新增的可讀名稱；2026-09-22 修正代碼對照（原本寫反，見
  // infrastructure/repositories/exchange/companyProfile.ts 的交叉比對）。
  financialReportTypeName: z.string().nullable().meta({ description: '「合併財報」或「個別財報」，未知代碼回 null（2026-09-22 前的對照是反的）' }),
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
  metricDataType: z.enum(['1', '2']).meta({ description: '本服務指標對這家公司實際採用的財報口徑（MOPS dataType）："2" 合併報表、"1" 個體報表。來自 mops-ts 的實際資料可得性：有合併報表就用合併，結構上只申報個體報表的公司（約 249 家）用個體。要標示「個體報表」看這個欄位。' }),
  // 2026-09-17：型別的真理來源改成 application/companies/types.ts 的介面（infrastructure 的
  // companyProfile.ts 也用它，不再反過來 import HTTP 層），這裡的 schema 用 satisfies 釘住，
  // 欄位對不上會編譯失敗。
}) satisfies z.ZodType<CompanyProfileDetail>;
export type { CompanyProfileDetail };

// 2026-09-17 Phase 4：entry schema 從 infrastructure 的 companyProfile.ts 搬來，型別真理來源是
// application/ports/companyProfiles.ts 的 CompanyNameEntry。
export const companyNameEntrySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']).meta({ description: '2026-09-19 新增：上市（twse-ts）或上櫃（tpex-ts）' }),
  sectorCode: z.string().nullable().meta({ description: '2026-09-19 新增：證交所類股代碼（兩碼，跟 GET /industries/securities-sectors 同一套）；掛在非產業代碼（07/91/98/XX）的公司為 null' }),
  sectorName: z.string().nullable().meta({ description: '2026-09-19 新增：類股中文名稱；sectorCode 為 null 或代碼字典尚未載入時為 null' }),
  isEmerging: z.boolean().meta({
    description:
      '2026-09-23 新增：是否為興櫃公司。這份目錄**刻意包含興櫃**（約 364 家，全部在 TPEx 側；TWSE 側恆為 false），' +
      '所以需要這個旗標才能分辨。注意興櫃**沒有月營收強制揭露**，依賴月營收的指標對它們永遠是空的；' +
      '上游各資料服務的「全市場」也一律指上市＋上櫃 1,985 家。拿這份目錄當母體算指標覆蓋率時，' +
      '要先扣掉 isEmerging=true 才會跟上游的數字對得起來。',
  }),
}) satisfies z.ZodType<CompanyNameEntry>;

// 2026-09-01 應 bff-ts 要求新增的 GET /companies 兩種回應形狀（依 countOnly 決定回哪一種）。
export const companiesListResultSchema = z.object({
  count: z.number().meta({ description: '全部公司總筆數（不受 limit/offset 影響）' }),
  limit: z.number(),
  offset: z.number(),
  entries: z.array(companyNameEntrySchema),
});

export const companiesCountOnlyResultSchema = z.object({
  count: z.number().meta({ description: '全部公司總筆數' }),
});

// 2026-09-17 Phase 4：以下兩組 entry schema 從 infrastructure 的 repository 檔案搬來（http 直接 import
// infrastructure 是分層違規），型別真理來源是 application/ports 的介面，用 satisfies 釘住。
// 五種結構化的股本變動原因，bigint 序列化成字串——2026-09-04 應 web-nuxt 要求新增，實測過
// capital_stock_history 沒有庫藏股/可轉債轉換的獨立欄位，這兩種變動反而是寫在 remarks
// 自由格式文字裡（例如「註銷庫藏股3,249,000股」），不是結構化數字欄位，見 remarks 說明。
export const capitalStockChangeSourceSchema = z.object({
  cashIncrease: z.string().nullable(),
  capitalReserveTransfer: z.string().nullable(),
  retainedEarningsTransfer: z.string().nullable(),
  mergerIncrease: z.string().nullable(),
  capitalReduction: z.string().nullable(),
  other: z.string().nullable().meta({ description: '自由格式文字，例如「發行限制員工權利新股2,353,000股」，不是這五種結構化原因之一時才會有值' }),
}) satisfies z.ZodType<CapitalStockChangeSource>;

export const capitalStockHistoryEntrySchema = z.object({
  effectiveDate: z.string().meta({ description: '"YYYY-MM"，這批資料是「異動事件序列」不是固定季度/年度快照，同一年可能 0 筆或多筆' }),
  paidInShares: z.string().meta({ description: '實際流通股數（不是千股），bigint 序列化成字串' }),
  paidInCapital: z.string().nullable().meta({ description: '實收資本額（元）' }),
  sharesChangePercent: z.number().nullable().meta({
    description: '跟「前一次異動」（時間序列上更早的那一筆，不是陣列順序上的前一筆——entries 是新到舊排序）相比，流通股數變動的百分比，四捨五入到小數 2 位。最早一筆（沒有更早的可以比較）是 null。',
  }),
  changeSource: capitalStockChangeSourceSchema,
  remarks: z.string().nullable().meta({ description: '自由格式文字，庫藏股註銷/核准日期文字說明等落在這裡，不是結構化欄位' }),
}) satisfies z.ZodType<CapitalStockHistoryEntry>;

// 2026-09-19：GET /companies/dividend-history（歷年股利表）的回應 schema，形狀真理來源是
// application/companies/dividendHistory.ts 的介面，這裡用 satisfies 釘住。口徑說明見那支檔案檔頭。
export const dividendHistoryEventSchema = z.object({
  fiscalQuarter: z.number().int().nullable().meta({ description: '季配公司才有值（1-4）；年配公司這欄是 null' }),
  cashDividend: z.number().meta({ description: '元／股，盈餘 + 資本公積' }),
  stockDividend: z.number().meta({ description: '元／股（股票股利以面額計），盈餘 + 資本公積' }),
  exDividendDate: z.string().nullable().meta({ description: 'YYYY-MM-DD' }),
  exRightsDate: z.string().nullable(),
  paymentDate: z.string().nullable().meta({ description: '現金股利發放日' }),
  announcementDate: z.string().nullable(),
  closeAtExDate: z.number().nullable().meta({ description: '除息日當天收盤價（已除息）；查無當天股價為 null' }),
  yieldAtExDate: z.number().nullable().meta({ description: 'cashDividend ÷ closeAtExDate × 100，四捨五入到小數 2 位' }),
}) satisfies z.ZodType<DividendHistoryEvent>;

export const dividendHistoryEntrySchema = z.object({
  fiscalYear: z.number().int().meta({ description: '西元，股利所屬年度（不是除息年度）' }),
  rocFiscalYear: z.number().int(),
  cashDividend: z.number().meta({ description: '該年度全部分派案的現金股利加總，元／股' }),
  stockDividend: z.number(),
  totalDividend: z.number(),
  distributionCount: z.number().int().meta({ description: '該年度分派幾次（年配 1、季配 4…）' }),
  exDividendDate: z.string().nullable().meta({ description: '該年度最後一次除息日；逐次日期看 events' }),
  exRightsDate: z.string().nullable(),
  paymentDate: z.string().nullable().meta({ description: '該年度最後一次現金股利發放日' }),
  eps: z.number().nullable().meta({ description: '該年度 EPS（metric_values 的 eps.Q 四季加總，跟 metric-history 同一份）；四季不齊為 null' }),
  payoutRatio: z.number().nullable().meta({ description: '%，cashDividend ÷ eps × 100；EPS ≤ 0 或缺 EPS 時為 null（虧損年度的配息率不硬算）' }),
  yieldAtExDate: z.number().nullable().meta({ description: '%，各次除息日「當天收盤價（已除息）」算的殖利率加總；任一次查無股價整年為 null（多數公司只有 2026-06 之後的股價，歷史列多為 null）' }),
  knowledgeDate: z.string().nullable().meta({ description: '該年度最後一次分派決議的公告日——這列數字最早何時被市場知道' }),
  events: z.array(dividendHistoryEventSchema).meta({ description: '逐次分派事件，依所屬季度/除息日由舊到新' }),
}) satisfies z.ZodType<DividendHistoryEntry>;

export const monthlyRevenueEntrySchema = z.object({
  yearMonth: z.string().meta({ description: '"YYYY-MM"' }),
  reportDate: z.string().nullable().meta({ description: '公告日 "YYYY-MM-DD"' }),
  industry: z.string().nullable(),
  currentMonthRevenue: z.string().nullable().meta({ description: '當月營收（新台幣千元），bigint 序列化成字串' }),
  lastYearSameMonthRevenue: z.string().nullable().meta({ description: '去年同月營收（新台幣千元）' }),
  yoyChangePercent: z.number().nullable().meta({ description: '年增率（%），來源直接算好的欄位，本服務原樣透傳' }),
  momChangePercent: z.number().nullable().meta({
    description: '月增率（%）——來源這批一次性回填的資料沒有算這個欄位，本服務用相鄰兩個月的 currentMonthRevenue 自己反推；最舊一筆（沒有更早的月份可比較）固定 null',
  }),
  cumulativeRevenue: z.string().nullable().meta({ description: '本年累計營收（新台幣千元）' }),
  cumulativeLastYearRevenue: z.string().nullable().meta({ description: '去年累計營收（新台幣千元）' }),
  cumulativeChangePercent: z.number().nullable().meta({ description: '累計營收年增率（%），來源直接算好的欄位，本服務原樣透傳' }),
  note: z.string().nullable(),
}) satisfies z.ZodType<MonthlyRevenueEntry>;

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

// 2026-09-10 web-nuxt 要求：piotroskiFScore 只寫入最終 0-9 分，9 個子訊號依 Piotroski
// (2000) 原始論文分組現查現算回傳，不是新的 metric_code，見 controller.ts 的
// getCompanyPiotroskiBreakdown。組內子分數（denominator 4/3/2）刻意不在這裡算，留給呼叫端
// 自己依 boolean 值加總。
export const piotroskiFScoreBreakdownResultSchema = z.object({
  symbol: z.string(),
  found: z.boolean().meta({ description: 'false 代表查無資料（或指定的 year/season 那一季查無資料），此時其餘欄位皆為 null' }),
  fiscalYear: z.number().nullable(),
  fiscalQuarter: z.number().nullable(),
  knowledgeDate: z.string().nullable(),
  knowledgeDateIsFallback: z.boolean().nullable(),
  totalScore: z.number().nullable().meta({ description: '跟 piotroskiFScore.Q 同一套全有全無邏輯——9 個子訊號只要有一個評估不出來，整體就是 null，不是拿其他 8 個湊分數' }),
  groups: z
    .object({
      profitability: z.object({
        positiveRoa: z.boolean().nullable(),
        positiveCfo: z.boolean().nullable(),
        roaImproved: z.boolean().nullable(),
        accrualQuality: z.boolean().nullable(),
      }),
      leverageLiquidity: z.object({
        leverageDecreased: z.boolean().nullable(),
        liquidityImproved: z.boolean().nullable(),
        noDilution: z.boolean().nullable(),
      }),
      operatingEfficiency: z.object({
        grossMarginImproved: z.boolean().nullable(),
        assetTurnoverImproved: z.boolean().nullable(),
      }),
    })
    .nullable()
    .meta({ description: '依 Piotroski 原始論文分組：獲利能力(4)/財務槓桿與流動性(3)/營運效率(2)；found=false 時為 null' }),
  groupMetadata: z
    .array(
      z.object({
        key: z.enum(['profitability', 'leverageLiquidity', 'operatingEfficiency']),
        name: z.string(),
        nameEn: z.string(),
        summary: z.string(),
        detail: z.string(),
        denominator: z.number(),
      })
    )
    .meta({ description: '2026-09-11 新增：3 個子分組各自的 name/nameEn/summary/detail/denominator，純靜態文字，不隨 symbol/期別變化，found=false 時仍會回傳（給前端 i18n 用，取代原本寫死在前端的文字）' }),
  signalLabels: z
    .record(z.string(), z.string())
    .meta({ description: '2026-09-11 新增：9 個訊號 key（positiveRoa/positiveCfo/...）各自的中文顯示標籤，純靜態文字，found=false 時仍會回傳' }),
});

// 2026-09-10：GET /companies/:symbol/metric-provenance 的回應 schema——跟寫入路徑
// （resolveRoeQuarterData/getAnnualDividendPerShareProxy/resolveSueInputs 三個 resolver）
// 都由 domainPitMetrics/shared/provenance/provenanceTypes.ts 共用，schema 定義留在
// domain 層、這裡只 re-export，避免跟 domainPitMetrics 之間產生循環依賴。
export { metricProvenanceResultSchema } from '@/application/metrics/shared/provenance/provenanceTypes';

// 2026-09-13：GET /companies/badges 的回應 schema——後端統一算好每支 badge 的 passed，
// 前端不用再拿 GET /metrics 的 badge.threshold 自己跟 metric-history 的數值比較，見
// evaluateCompanyBadges.ts 的完整說明。
export const companyBadgeResultSchema = z.object({
  metricCode: z.string().meta({ description: '對應 GET /metrics 的 metricCode，可直接拿去打 metric-history/metric-provenance' }),
  name: z.string().meta({ description: '徽章的中文名稱（法則名稱，不一定跟指標本身的 name 相同，例如 Fidelity 股利發放率最適區間）' }),
  nameEn: z.string().optional().meta({ description: '英文名稱，選填，沒有時是 undefined' }),
  timeframe: z.string().meta({ description: '這支 badge 讀值用的 timeframe（對應 metric-history 的 timeframe 參數）' }),
  value: z.number().nullable().meta({ description: '這支指標最新一期的數值；null 代表算不出來，原因見 nullReason' }),
  nullReason: z
    .enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history'])
    .nullable()
    .meta({ description: 'value 為 null 時的原因；value 非 null 時一律是 null' }),
  knowledgeDate: z.string().nullable().meta({ description: '2026-09-14 新增：這筆值最早可被市場知道的日期（"YYYY-MM-DD"），跟 metrics-history 同一個語意；查無資料時是 null' }),
  knowledgeDateIsFallback: z.boolean().nullable().meta({ description: '2026-09-14 新增：true 代表 knowledgeDate 是用財報期末日頂替的（沒有真實公告日），有 look-ahead bias 風險；查無資料時是 null' }),
  passed: z.boolean().nullable().meta({ description: '是否達成門檻；value 為 null 時 passed 也一定是 null（無法判定，不是「未達成」）' }),
  warning: z.boolean().nullable().meta({
    description:
      '2026-09-20 新增：是否落在出處定義的弱/警示區（見 GET /metrics 的 badge.threshold.warning）。徽章沒有定義 warning 門檻、' +
      '或 value 為 null 時一律 null。跟 passed 互斥不會同時 true；passed=false 且 warning=false 代表落在中間區。前端顯示：' +
      'passed → 達成、warning → 警示、都 false → 中間、null → 無法判定。',
  }),
  percentile: z.number().nullable().meta({
    description:
      '2026-09-21 新增：只有出處是「橫斷面排名」（見 GET /metrics 的 badge.threshold.percentileRank）的徽章才會填，其餘一律 null。' +
      '贏過全市場/同類股的百分比（0-100，數字越大排名越前面），例如 95 代表贏過 95% 的比較對象。',
  }),
  rank: z.number().int().nullable().meta({ description: '2026-09-21 新增：只有 percentileRank 徽章才會填，原始名次（並列共用名次），其餘一律 null。' }),
  totalCount: z.number().int().nullable().meta({ description: '2026-09-21 新增：只有 percentileRank 徽章才會填，排名母體總數（market=全市場、sector=同類股家數），其餘一律 null。' }),
  thresholdValue: z.number().nullable().meta({
    description:
      '2026-09-22 新增：只有 percentileRank 徽章才會填，其餘一律 null。門檻分界線落在指標本身單位上的值——排名母體裡（依 badge.threshold.percentileRank.direction 排序）恰好落在 topPercent 分界那家公司的指標值，單位與精度同 value。' +
      '前端可印成「前 20%（研發密度 ≥ 12.34%）」，asc 方向的徽章則是「≤」。跟 passed 用同一條規則（rank/totalCount ≤ topPercent/100）。',
  }),
});

export const companyBadgeCategorySchema = z.object({
  categoryKey: z.string().meta({ description: '對應 GET /metrics 的 categoryKey' }),
  categoryDisplayName: z.string().meta({ description: '分類中文名稱，例如「安全韌性」' }),
  badges: z.array(companyBadgeResultSchema),
});

export const companyBadgesResultSchema = z.object({
  symbol: z.string(),
  categories: z.array(companyBadgeCategorySchema).meta({ description: '只列出至少有 1 支 badge 的分類；沒有 badge 的分類（例如 profitability）不會出現' }),
});

// 2026-09-13：GET /companies/metric-completeness 的回應 schema——跟 companyBadgeResultSchema
// 不同的是範圍涵蓋 GET /metrics 全部指標（不限有 badge 的 15 支），且不判定「達成/未達成」
// （沒有門檻概念），只回答「這家公司這支指標有沒有算出值」，見
// evaluateCompanyMetricCompleteness.ts 的完整說明。
export const companyMetricCompletenessEntrySchema = z.object({
  metricCode: z.string().meta({ description: '對應 GET /metrics 的 metricCode，可直接拿去打 metric-history/metric-provenance' }),
  name: z.string().meta({ description: '指標中文名稱' }),
  nameEn: z.string().optional().meta({ description: '英文名稱，選填，沒有時是 undefined' }),
  timeframe: z.string().nullable().meta({ description: '這次查詢用的代表性 timeframe（優先 TTM，否則取第一個可用 timeframe）；null 代表這支 metricCode 沒有任何可用 timeframe（防呆用，目前沒有已知案例）' }),
  hasValue: z.boolean().meta({ description: '這個 timeframe 下最新一期是否有算出值' }),
  nullReason: z
    .enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history'])
    .nullable()
    .meta({ description: 'hasValue 為 false 時的原因；hasValue 為 true 時一律是 null。timeframe 為 null 時也一律是 null' }),
});

export const companyMetricCompletenessCategorySchema = z.object({
  categoryKey: z.string().meta({ description: '對應 GET /metrics 的 categoryKey' }),
  categoryDisplayName: z.string().meta({ description: '分類中文名稱，例如「安全韌性」' }),
  metrics: z.array(companyMetricCompletenessEntrySchema),
  coveredCount: z.number().int().meta({ description: '這個分類裡 hasValue 為 true 的指標數' }),
  totalCount: z.number().int().meta({ description: '這個分類的指標總數' }),
});

export const companyMetricCompletenessResultSchema = z.object({
  symbol: z.string(),
  coveredCount: z.number().int().meta({ description: '全部分類加總的 hasValue 為 true 指標數' }),
  totalCount: z.number().int().meta({ description: '全部分類加總的指標總數' }),
  categories: z.array(companyMetricCompletenessCategorySchema),
});
