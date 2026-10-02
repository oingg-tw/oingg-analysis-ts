import { z } from 'zod';
import type { SectorDividendSummaryResult, SecuritiesIndustrySectorsResult } from '@/application/industries/types';

// 2026-10-02 「產業追蹤」樹狀階層瀏覽（GET /industries/tree、/flat）下架，對應 schema 移除。
// 2026-09-17 Phase 4：形狀的真理來源是 application/industries/types.ts 的介面，這裡用 satisfies 釘住。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的
// chainClassification*/chainCluster*/industryTree* schema（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。

// 2026-09-11 新增——證交所類股分類（twse-ts/tpex-ts company_profile.industry，投資人習慣
// 的「半導體業」「電子零組件業」這種類股），跟上面財政部稅籍五層分類/tpex-ts 產業價值鏈都是
// 完全不同的體系：只有單一層級（不是樹狀），40 個代碼扁平列出，刻意獨立一組 schema。

export const securitiesIndustrySectorSchema = z.object({
  code: z.string().meta({ description: '兩碼證交所類股代碼，例如 "24"' }),
  name: z.string().meta({ description: '中文類股名稱，例如「半導體業」' }),
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
