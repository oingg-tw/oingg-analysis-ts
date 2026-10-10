import { z } from 'zod';
import type { SectorDividendSummaryResult, SectorMetricHistoryResult, SectorMonthlyRevenueHistoryResult, SectorSummaryResult, SecuritiesIndustrySectorsResult } from '@/application/industries/types';
import { MAX_SECTOR_SUMMARY_FIELDS } from '@/application/industries/service';

// 2026-10-02 「產業追蹤」樹狀階層瀏覽（GET /industries/tree、/flat）下架，對應 schema 移除。
// 2026-09-17 Phase 4：形狀的真理來源是 application/industries/types.ts 的介面，這裡用 satisfies 釘住。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的
// chainClassification*/chainCluster*/industryTree* schema（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。

// 2026-09-11 新增——證交所類股分類（twse-ts/tpex-ts company_profile.industry，投資人習慣
// 的「半導體業」「電子零組件業」這種類股），跟上面財政部稅籍五層分類/tpex-ts 產業價值鏈都是
// 完全不同的體系：只有單一層級（不是樹狀），40 個代碼扁平列出，刻意獨立一組 schema。

export const securitiesIndustrySectorSchema = z.object({
  sectorCode: z.string().meta({ description: '兩碼證交所類股代碼，例如 "24"' }),
  sectorName: z.string().meta({ description: '中文類股名稱，例如「半導體業」' }),
  code: z.string().meta({ description: '已退役，2026-10-24 移除，改用 sectorCode', deprecated: true }),
  name: z.string().meta({ description: '已退役，2026-10-24 移除，改用 sectorName', deprecated: true }),
  companyCount: z.number().meta({ description: '這個類股底下總共幾家公司（TWSE+TPEx 加總）' }),
});

export const securitiesIndustrySectorsResultSchema = z.object({
  sectors: z.array(securitiesIndustrySectorSchema),
}) satisfies z.ZodType<SecuritiesIndustrySectorsResult>;
export type { SecuritiesIndustrySectorsResult };

// 2026-09-30 產業分析圖表（每個類股一個點：Y 殖利率、X 股利 3 年成長率），見 application/industries/service.ts。
const axisSummarySchema = (label: string) =>
  z.object({
    count: z.number().meta({ description: `這個類股${label}有值的公司數（可能小於 companyCount）` }),
    mean: z.number().nullable().meta({ description: `平均數（%）；count 為 0 時 null` }),
    median: z.number().nullable().meta({ description: `中位數（%）；count 為 0 時 null` }),
  });

export const sectorDividendSummaryResultSchema = z.object({
  dividendYieldTradeDate: z.string().nullable().meta({ description: '殖利率母體裡最新的交易日（YYYY-MM-DD）；圖表標資料日期用' }),
  sectors: z.array(
    z.object({
      sectorCode: z.string().meta({ description: '證交所類股代碼，同 GET /industries/securities-sectors' }),
      sectorName: z.string(),
      companyCount: z.number().meta({ description: '這個類股的上市＋上櫃公司數（不含興櫃）' }),
      dividendYield: axisSummarySchema('殖利率').meta({ description: '交易所每日公布殖利率（dividendYield.EOD），每家取最新一筆；0（沒配息）算進去' }),
      dividendGrowthRate3y: axisSummarySchema('股利 3 年成長率').meta({ description: '股利 3 年成長率（dividendGrowthRate3y.FY），每家取最新年度；基期沒配息或歷史不足的公司沒有值、不計入' }),
    })
  ),
}) satisfies z.ZodType<SectorDividendSummaryResult>;
export type { SectorDividendSummaryResult };

// 2026-10-09 web-nuxt 產業分析三支類股端點，見 application/industries/service.ts 的 getSector* 三支。
export const sectorParamsSchema = z.object({ sectorCode: z.string().min(1).meta({ description: '證交所類股代碼，同 GET /industries/securities-sectors', example: '24' }) });

const quartileFields = {
  count: z.number().meta({ description: '有值的公司數；0 時 median／q1／q3 都是 null' }),
  median: z.number().nullable().meta({ description: '中位數（連續內插，同 Postgres percentile_cont；偶數家取中間兩家平均）' }),
  q1: z.number().nullable().meta({ description: '第 25 百分位' }),
  q3: z.number().nullable().meta({ description: '第 75 百分位' }),
};

export const getSectorMetricHistoryQuerySchema = z.object({
  metricCode: z.string({ error: 'metricCode is required.' }).min(1).meta({ description: '季報型、非每股類的 metricCode，例如 "roe"、"grossMargin"', example: 'grossMargin' }),
  timeframe: z.string({ error: 'timeframe is required.' }).min(1).meta({ description: "'Q'/'YTD'/'TTM'/'FY' 之一，實際允許哪些由 metricCode 決定（見 GET /metrics），同 GET /companies/metric-history", example: 'TTM' }),
  limit: z.coerce.number().int().min(1).max(40).default(20).meta({ description: '取最近幾期，預設 20，上限 40。' }),
});

export const sectorMetricHistoryResultSchema = z.object({
  sectorCode: z.string(),
  sectorName: z.string(),
  metricCode: z.string(),
  timeframe: z.string(),
  entries: z
    .array(
      z.object({
        fiscalYear: z.number().meta({ description: '西元年' }),
        fiscalQuarter: z.number().meta({ description: '季別；FY 固定是 4' }),
        ...quartileFields,
        nullReason: z.string().nullable().meta({ description: 'count 為 0 時，那一期最多公司的 nullReason（例如 not_applicable_industry）；有值的期別為 null' }),
      })
    )
    .meta({ description: '由舊到新' }),
}) satisfies z.ZodType<SectorMetricHistoryResult>;

// 2026-10-10 上限 132：同個股月營收端點（companies/schemas.ts），上游回補到 2016-01 後約 128 個月。
const MAX_SECTOR_MONTHLY_REVENUE_LIMIT = 132;
export const getSectorMonthlyRevenueHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_SECTOR_MONTHLY_REVENUE_LIMIT).default(60).meta({ description: `取最近幾個月，預設 60，上限 ${MAX_SECTOR_MONTHLY_REVENUE_LIMIT}。` }),
});

export const sectorMonthlyRevenueHistoryResultSchema = z.object({
  sectorCode: z.string(),
  sectorName: z.string(),
  total: z.number().meta({ description: '總共有幾個月（不受 limit 影響）' }),
  hasMore: z.boolean().meta({ description: '還有更早的月份沒有回傳' }),
  entries: z
    .array(
      z.object({
        yearMonth: z.string().meta({ description: '營收所屬月份 YYYY-MM' }),
        currentMonthRevenue: z.string().meta({ description: '同一批公司的當月營收合計（新台幣千元，字串避免精度問題）' }),
        lastYearSameMonthRevenue: z.string().meta({ description: '同一批公司的去年同月營收合計（千元）' }),
        yoyChangePct: z.number().nullable().meta({ description: '年增率（%）＝ currentMonthRevenue ÷ lastYearSameMonthRevenue − 1' }),
        companyCount: z.number().meta({ description: '這一批（當月有營收、去年同月營收大於 0）的公司數' }),
      })
    )
    .meta({ description: '由舊到新' }),
}) satisfies z.ZodType<SectorMonthlyRevenueHistoryResult>;

export const getSectorSummaryQuerySchema = z.object({
  fields: z.string({ error: 'fields is required.' }).min(1).meta({ description: `逗號分隔的欄位，格式同 screener（metricCode.timeframe），最多 ${MAX_SECTOR_SUMMARY_FIELDS} 個`, example: 'revenueGrowthRate.TTM,netIncomeGrowthRate.TTM' }),
});

export const sectorSummaryResultSchema = z.object({
  sectors: z.array(
    z.object({
      sectorCode: z.string(),
      sectorName: z.string(),
      companyCount: z.number().meta({ description: '這個類股的上市＋上櫃公司數（不含興櫃）' }),
      fields: z.record(z.string(), z.object(quartileFields)).meta({ description: 'key 是請求的 field 字串（例如 "revenueGrowthRate.TTM"）' }),
    })
  ),
}) satisfies z.ZodType<SectorSummaryResult>;
