import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// backfill/稽核腳本對 analysis DB 的零星查詢——2026-09-17 Phase 6 從 scripts/*.ts 搬來（逐字）。

// 全市場某支 TTM 指標「每家公司最新一筆非 null 值」——magicFormulaRank 的橫斷面排名輸入
// （scripts/backfillMagicFormulaRankPit.ts）。value 用 ::float 轉成原生 number。
export interface LatestTtmMetricRow {
  symbol: string;
  value: number;
  fiscal_year: number;
  fiscal_quarter: number;
  knowledge_date: Date;
  knowledge_date_is_fallback: boolean;
}

export const listLatestTtmValuesAcrossMarket = (metricCode: string): Promise<LatestTtmMetricRow[]> =>
  analysisPrisma.$queryRaw<LatestTtmMetricRow[]>`
    SELECT DISTINCT ON (symbol) symbol, value::float AS value, fiscal_year, fiscal_quarter, knowledge_date, knowledge_date_is_fallback
    FROM metric_values
    WHERE metric_code = ${metricCode} AND period_type = 'TTM' AND subsidiary_company_id = '' AND value IS NOT NULL
    ORDER BY symbol, fiscal_year DESC, fiscal_quarter DESC, knowledge_date DESC
  `;

// 缺口掃描（scripts/scanMetricGapsPit.ts）：某一季、某批公司、某批 metricCode 的全部列（含重編疊加的多筆）。
export interface GapScanRow {
  symbol: string;
  metricCode: string;
  value: unknown;
  nullReason: string | null;
}

export const listMetricValuesForGapScan = (input: { metricCodes: string[]; fiscalYear: number; fiscalQuarter: number; symbols: string[] }): Promise<GapScanRow[]> =>
  analysisPrisma.metricValue.findMany({
    where: {
      metricCode: { in: input.metricCodes },
      fiscalYear: input.fiscalYear,
      fiscalQuarter: input.fiscalQuarter,
      subsidiaryCompanyId: '',
      symbol: { in: input.symbols },
    },
    select: { symbol: true, metricCode: true, value: true, nullReason: true },
  });

// parity 證明（scripts/verifyMetricEquivalencePit.ts）：時間窗內 shadow 表新增的列數，理論上要是 0。
export const countShadowRowsSince = (since: Date): Promise<number> => analysisPrisma.metricUpsertShadow.count({ where: { capturedAt: { gte: since } } });

// 排行榜退化稽核（scripts/auditRankDegeneracy.ts）：每支指標取「每家公司最新一筆非 null 值」由大到小排前 N 名，
// 回報這 N 名總共跨越幾個不同數值。
//
// 2026-09-22 由 web-nuxt 撤掉 consecutiveDividendYears 排行頁引出：889 家並列 5，所以第 2~50 名其實是並列者裡
// 代號最小的 49 家——旁邊加警語救不了，那仍然是把市場的任意子集當成排名呈現。掃完發現同樣退化的還有
// threeMarginsRising（前 50 名全是 3）、consecutiveProfitYears、piotroskiFScore、dividendDistributionCount。
// 退化有兩種成因，處理方式不同：資料深度天花板（連續年數類，XBRL 109Q3 地板，會自己好）vs 指標值域本來就只有
// 幾個整數（三率三升 0~3、F-Score 0~9、配息次數 1~4，永遠不會好，不該有排行頁）。
// 新增指標要上排行榜/percentile 徽章之前先跑這支。
export interface RankDegeneracyRow {
  metric_code: string;
  companies: number;
  distinct_in_top_n: number;
  top_value: number;
  value_at_n: number;
}

export const listRankDegeneracy = (topN: number, minCompanies: number): Promise<RankDegeneracyRow[]> =>
  analysisPrisma.$queryRaw<RankDegeneracyRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (metric_code, symbol) metric_code, symbol, value
      FROM metric_values WHERE value IS NOT NULL AND subsidiary_company_id = ''
      ORDER BY metric_code, symbol, knowledge_date DESC
    ), ranked AS (
      SELECT metric_code, value,
             ROW_NUMBER() OVER (PARTITION BY metric_code ORDER BY value DESC) AS rn,
             COUNT(*) OVER (PARTITION BY metric_code) AS companies
      FROM latest
    )
    SELECT metric_code, MAX(companies)::int AS companies,
           COUNT(DISTINCT value)::int AS distinct_in_top_n,
           MAX(value)::float AS top_value, MIN(value)::float AS value_at_n
    FROM ranked WHERE rn <= ${topN}
    GROUP BY metric_code HAVING MAX(companies) >= ${minCompanies}
    ORDER BY COUNT(DISTINCT value) ASC, MAX(companies) DESC
  `;
