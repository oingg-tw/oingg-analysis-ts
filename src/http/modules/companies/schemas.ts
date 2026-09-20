import { z } from 'zod';
import { PILOT_PROVENANCE_METRIC_CODES } from '@/application/metrics/shared/provenance/provenanceTypes';
import { FINANCIAL_STATEMENT_TYPES } from '@/application/companies/financialStatement';
import { MAX_METRIC_CODES_PER_REQUEST } from '@/application/companies/history';

// GET /companies/* 的請求 schema。2026-09-17 Phase 4 從 8 支 controller 檔案搬來，逐字不變；
// 2026-09-05 起這些 query schema 就是 export——zod-to-openapi 的 Swagger 文件直接引用同一個
// schema 產生 parameters，不再像以前手寫 JSDoc 那樣是另一份要手動保持同步的東西。

const symbolField = z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' });

// limit 的「值」（這次要幾筆）由呼叫端（bff-ts）依他們的業務邏輯決定，每次請求可以不一樣，
// 本服務不代為決定；limit 的「上限」（最多允許幾筆）由本服務依自己扛不扛得住決定，所有請求
// 一致——2026-09-01 使用者訂的原則。payload 很輕（每筆只有兩個字串），上限抓寬鬆一點。
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

export const getCompaniesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).meta({ description: `這次要拿幾筆，預設 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}。` }),
  offset: z.coerce.number().int().min(0).default(0).meta({ description: '跳過前面幾筆，預設 0。' }),
  // z.coerce.boolean() 是個陷阱——底層用 JS 的 Boolean(value)，query string 只要非空字串
  // （包含字面上的 "false"）一律轉成 true。用字串本身判斷才對。transform 直接放在匯出的 schema 上：
  // zod-to-openapi 文件化的是 transform 前的輸入 schema（optional string），跟以前分兩份 schema 時一樣。
  countOnly: z
    .string()
    .optional()
    .meta({ description: 'true 時只回總筆數（`{ count }`），不拉實際資料。' })
    .transform((value) => value === 'true'),
});

export const getCompanyProfileQuerySchema = z.object({
  symbol: symbolField,
});

// 查無資料回傳空陣列，不是 404——mops 這批資料目前不是每家公司都有覆蓋，「查無股本異動
// 歷史」是正常情境，不代表這家公司不存在（公司存不存在是 /companies/profile 負責判斷的事）。
export const getCompanyCapitalStockHistoryQuerySchema = z.object({
  symbol: symbolField,
});

// 2026-09-19 歷年股利表——同樣查無分派紀錄回 entries: []，不是 404。
export const getCompanyDividendHistoryQuerySchema = z.object({
  symbol: symbolField,
});

// ROE 這支指標目前允許的 periodType 只有這兩種（見 metricDefinitionRegistry.roe.allowedPeriodTypes），
// 這裡刻意獨立宣告成 query 參數的合法值，不直接沿用通用的 periodTypeSchema（那個還有 YTD/FY，
// 對 ROE 沒有意義）——兩邊要保持同步。
// 2026-09-08：這個 query 參數原本叫 basis，改名 periodType 是「metric_values.basis 拆成四個精準命名欄位」
// 重構的一部分，是外部契約 breaking change。
const ROE_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'TTM'] as const;
const MAX_ROE_HISTORY_LIMIT = 40; // 10 年份季度資料，畫圖情境不需要更多

export const getCompanyRoeHistoryQuerySchema = z.object({
  symbol: symbolField,
  periodType: z.enum(ROE_HISTORY_PERIOD_TYPE_VALUES).default('TTM').meta({ description: '單季(Q)/近四季(TTM)，預設 TTM' }),
  limit: z.coerce.number().int().min(1).max(MAX_ROE_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

// ROA 這支指標目前允許的 periodType 跟 ROE 一模一樣。
const ROA_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'TTM'] as const;
const MAX_ROA_HISTORY_LIMIT = 40;

export const getCompanyRoaHistoryQuerySchema = z.object({
  symbol: symbolField,
  periodType: z.enum(ROA_HISTORY_PERIOD_TYPE_VALUES).default('TTM').meta({ description: '單季(Q)/近四季(TTM)，預設 TTM' }),
  limit: z.coerce.number().int().min(1).max(MAX_ROA_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

// Dupont 拆解沒有 Q_ANN——dupontDecomposedRoe/equityMultiplier 都沒有這個變體。
const DUPONT_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'TTM'] as const;
const MAX_DUPONT_HISTORY_LIMIT = 40;

export const getCompanyDupontHistoryQuerySchema = z.object({
  symbol: symbolField,
  periodType: z.enum(DUPONT_HISTORY_PERIOD_TYPE_VALUES).default('Q').meta({ description: '單季(Q)/近四季(TTM)，預設 Q' }),
  limit: z.coerce.number().int().min(1).max(MAX_DUPONT_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

const MAX_METRIC_HISTORY_LIMIT = 40;

export const getCompanyMetricHistoryQuerySchema = z.object({
  symbol: symbolField,
  metricCode: z
    .string({ error: 'metricCode is required.' })
    .min(1)
    .meta({ description: 'point-in-time 架構的指標代碼，例如 "eps"、"bvps"——完整清單見 metricDefinitionRegistry.ts，之後新增指標會持續增加', example: 'eps' }),
  timeframe: z
    .string({ error: 'timeframe is required.' })
    .min(1)
    .meta({ description: "'Q'/'YTD'/'TTM'/'FY' 之一（季報型），或 '<lookbackRange>_<samplingInterval>'（滾動統計量，例如 '2Y_1W'），或 'EOD'（市場快照）——實際允許哪些由 metricCode 決定，不符合會回 400，可用組合見 GET /metrics" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

export const getCompanyMetricsHistoryQuerySchema = z.object({
  symbol: symbolField,
  metricCodes: z
    .string({ error: 'metricCodes is required.' })
    .min(1)
    .meta({ description: `逗號分隔的 metricCode 清單，例如 "grossMargin,operatingMargin,netProfitMargin"（最多 ${MAX_METRIC_CODES_PER_REQUEST} 個）`, example: 'grossMargin,operatingMargin,netProfitMargin' }),
  timeframe: z
    .string({ error: 'timeframe is required.' })
    .min(1)
    .meta({ description: "'Q'/'YTD'/'TTM'/'FY' 之一（季報型），或 '<lookbackRange>_<samplingInterval>'（滾動統計量），或 'EOD'（市場快照），套用到清單裡的每個 metricCode，任一個不允許就整體回 400，可用組合見 GET /metrics" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

const MAX_MONTHLY_REVENUE_HISTORY_LIMIT = 120; // 上限抓 10 年份，目前資料只有 2330 60 個月，上限只是預留空間

export const getCompanyMonthlyRevenueHistoryQuerySchema = z.object({
  symbol: symbolField,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MONTHLY_REVENUE_HISTORY_LIMIT)
    .default(60)
    .meta({ description: `取最近幾個月，預設 60（5 年），上限 ${MAX_MONTHLY_REVENUE_HISTORY_LIMIT}。` }),
});

// year/season 成對的季度指定——financial-statement / piotroski-breakdown / metric-provenance 三支共用同一段規則。
const yearField = z
  .string()
  .regex(/^\d{2,3}$/, 'year 必須是民國年數字字串，例如 "115"。')
  .optional();
const seasonField = z.enum(['1', '2', '3', '4']).optional().meta({ description: '季別 1-4；跟 year 要成對提供' });
const yearSeasonPaired = () => ({ message: 'year 和 season 必須成對提供，只給其中一個是無效請求。', path: ['season'] });

export const getCompanyFinancialStatementQuerySchema = z
  .object({
    symbol: symbolField,
    statementType: z
      .enum(FINANCIAL_STATEMENT_TYPES, { error: 'statementType is required, 必須是 balanceSheet/incomeStatement/cashFlowStatement 之一。' })
      .meta({ description: '會計模式要看哪一張表：balanceSheet(資產負債表)/incomeStatement(損益表)/cashFlowStatement(現金流量表)', example: 'balanceSheet' }),
    year: yearField.meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓該張表最新一季', example: '115' }),
    season: seasonField,
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), yearSeasonPaired());

export const getCompanyPiotroskiBreakdownQuerySchema = z
  .object({
    symbol: symbolField,
    year: yearField.meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓最新一季', example: '115' }),
    season: seasonField,
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), yearSeasonPaired());

// symbol 用路徑參數（不是 query），是這支端點跟其餘 /companies/* 端點刻意不同的地方，配合 web-nuxt 提議的路徑格式。
// metricCode 用 z.enum 驗證，不支援的指標直接被 zod 擋成 400，不是隱性涵蓋所有指標，吸取 dependsOn 的教訓。
export const getCompanyMetricProvenanceQuerySchema = z
  .object({
    metricCode: z.enum(PILOT_PROVENANCE_METRIC_CODES, { error: `metricCode is required, 目前僅支援 ${PILOT_PROVENANCE_METRIC_CODES.join('/')}。` }),
    year: yearField.meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓最新一季', example: '115' }),
    season: seasonField,
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), yearSeasonPaired());

export const getCompanyBadgesQuerySchema = z.object({
  symbol: symbolField,
});

export const getCompanyMetricCompletenessQuerySchema = z.object({
  symbol: symbolField,
});

export const getCompanyBetaQuerySchema = z.object({
  symbol: symbolField,
});
