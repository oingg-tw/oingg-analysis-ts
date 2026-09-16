import { sitcaExportPrisma } from '@/infrastructure/prisma/sitcaExportClient';
import type { EtfDataPort } from '@/application/ports/etfData';
import { buildEtfScreenerSql } from './etfScreenerQuery';
import type { Prisma } from '#generated/sitca-export-client';

// 執行 ./etfScreenerQuery.ts 組出來的 Prisma.Sql。
export const runEtfRawQuery = <T>(sql: Prisma.Sql): Promise<T[]> => sitcaExportPrisma.$queryRaw<T[]>(sql);

// sitca-ts 的 ETF export view（etf_basic_info / etf_monthly_statement / etf_performance /
// fund_expense_ratio_annual_full_year）——2026-09-17 重構 Phase 2 從 http/modules/market/
// etfRanking/service.ts 跟 etfScreener/service.ts 搬來的 raw SQL（逐字），回傳原始列形狀
// （bigint / Decimal 物件），轉換維持在呼叫端。

export interface RawEtfBasicInfoRow {
  symbol: string;
  fund_name: string | null;
  security_short_name: string | null;
  company_name: string | null;
  category: string | null;
  distribution_class_info: string | null;
  is_actively_managed: boolean | null;
}

export interface RawEtfStatementRow {
  symbol: string;
  fund_tax_id: string | null;
  aum_twd: bigint | null;
  total_holders: bigint | null;
  subscription_amount_twd: bigint | null;
  redemption_amount_twd: bigint | null;
  dca_amount_twd: bigint | null;
  aum_below_statutory_threshold: boolean | null;
}

export interface RawEtfPerformanceRow {
  symbol: string;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  return_2y: number | null;
  return_3y: number | null;
  return_5y: number | null;
  return_ytd: number | null;
  return_10y: number | null;
}

// etf_basic_info 最新的 year_month（'YYYYMM'），etfRanking/etfScreener 都以它當「當月快照」的基準。
export const getLatestEtfYearMonth = async (): Promise<string | null> => {
  const rows = await sitcaExportPrisma.$queryRaw<{ year_month: string | null }[]>`
    SELECT MAX(year_month) as year_month FROM "export"."etf_basic_info"
  `;
  return rows[0]?.year_month ?? null;
};

export const listEtfBasicInfo = (yearMonth: string): Promise<RawEtfBasicInfoRow[]> =>
  sitcaExportPrisma.$queryRaw<RawEtfBasicInfoRow[]>`
    SELECT symbol, fund_name, security_short_name, company_name, category, distribution_class_info, is_actively_managed
    FROM "export"."etf_basic_info"
    WHERE year_month = ${yearMonth}
  `;

export const listEtfMonthlyStatement = (yearMonth: string): Promise<RawEtfStatementRow[]> =>
  sitcaExportPrisma.$queryRaw<RawEtfStatementRow[]>`
    SELECT symbol, fund_tax_id, aum_twd, total_holders, subscription_amount_twd, redemption_amount_twd, dca_amount_twd, aum_below_statutory_threshold
    FROM "export"."etf_monthly_statement"
    WHERE year_month = ${yearMonth}
  `;

// 只補 belowStatutoryThreshold 這個顯示欄位用的精簡查詢（報酬率排行）。
export const listEtfStatementThresholdFlags = (yearMonth: string): Promise<{ symbol: string; aum_below_statutory_threshold: boolean | null }[]> =>
  sitcaExportPrisma.$queryRaw<{ symbol: string; aum_below_statutory_threshold: boolean | null }[]>`
    SELECT symbol, aum_below_statutory_threshold
    FROM "export"."etf_monthly_statement"
    WHERE year_month = ${yearMonth}
  `;

// 費用率排行要用 fund_tax_id 對 fund_expense_ratio_annual_full_year。
export const listEtfStatementTaxIdAndThreshold = (yearMonth: string): Promise<{ symbol: string; fund_tax_id: string | null; aum_below_statutory_threshold: boolean | null }[]> =>
  sitcaExportPrisma.$queryRaw<{ symbol: string; fund_tax_id: string | null; aum_below_statutory_threshold: boolean | null }[]>`
    SELECT symbol, fund_tax_id, aum_below_statutory_threshold
    FROM "export"."etf_monthly_statement"
    WHERE year_month = ${yearMonth}
  `;

export const listEtfPerformance = (yearMonth: string): Promise<RawEtfPerformanceRow[]> =>
  sitcaExportPrisma.$queryRaw<RawEtfPerformanceRow[]>`
    SELECT symbol, return_3m, return_6m, return_1y, return_2y, return_3y, return_5y, return_ytd, return_10y
    FROM "export"."etf_performance"
    WHERE year_month = ${yearMonth}
  `;

// 只用「最新一個完整年度」的總費用率——sitca-ts 的 fund_expense_ratio_annual_full_year view 已用
// 他們自己的 is_partial_year 排除掉當年新掛牌/中途清算這類只涵蓋部分期間的列。
export const listFullYearExpenseRatios = (year: number): Promise<{ fund_tax_id: string; total_rate: number | null }[]> =>
  sitcaExportPrisma.$queryRaw<{ fund_tax_id: string; total_rate: number | null }[]>`
    SELECT fund_tax_id, total_rate
    FROM "export"."fund_expense_ratio_annual_full_year"
    WHERE year = ${year}
  `;

// ETF 篩選器的類別欄位選單——現查 distinct 值（不寫死，sitca-ts 分類異動會直接反映）。
export const listDistinctEtfAssetClasses = async (): Promise<string[]> => {
  const rows = await sitcaExportPrisma.$queryRaw<{ value: string | null }[]>`
    SELECT DISTINCT substring(category from 'ETF_(.+)ETF') as value
    FROM "export"."etf_basic_info"
    WHERE category ~ 'ETF_.+ETF$'
    ORDER BY 1
  `;
  return rows.map((r) => r.value).filter((v): v is string => v !== null);
};

// 「分配(頻率)」的解析 regex 跟 etfScreenerQuery.ts 的 distributionFrequency 欄位表達式是同一條，
// 兩邊要一起改。
export const listDistinctEtfDistributionFrequencies = async (): Promise<string[]> => {
  const rows = await sitcaExportPrisma.$queryRaw<{ value: string | null }[]>`
    SELECT DISTINCT CASE
      WHEN distribution_class_info LIKE '%不分配%' THEN '不分配'
      ELSE substring(distribution_class_info from '分配\\((.+)\\)')
    END as value
    FROM "export"."etf_basic_info"
    ORDER BY 1
  `;
  return rows.map((r) => r.value).filter((v): v is string => v !== null);
};

// application/ports/etfData.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。screenEtfs = ./etfScreenerQuery.ts 組 SQL + 這裡執行，
// Prisma.Sql 不出 infrastructure。
export const sitcaEtfData: EtfDataPort = {
  getLatestEtfYearMonth,
  listEtfBasicInfo,
  listEtfMonthlyStatement,
  listEtfStatementThresholdFlags,
  listEtfStatementTaxIdAndThreshold,
  listEtfPerformance,
  listFullYearExpenseRatios,
  listDistinctEtfAssetClasses,
  listDistinctEtfDistributionFrequencies,
  screenEtfs: (yearMonth, filters, columns, page, pageSize, sort) => runEtfRawQuery<Record<string, unknown>>(buildEtfScreenerSql(yearMonth, filters, columns, page, pageSize, sort)),
};
