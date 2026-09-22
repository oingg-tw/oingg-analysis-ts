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
