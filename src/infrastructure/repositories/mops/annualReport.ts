import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { AnnualReportPort } from '@/application/ports/annualReport';

// 年報 = mops-ts 長表 statement_type='income_statement_cumulative' 的 quarter=4（累計到第四季 = 全年），
// mops-ts 2026-09-25 確認這個定義可以依賴；他們另開明確的 export.annual_income_statement 之後改讀那裡。
// EPS 讀 `basic_earnings_loss_per_share`（總數）而不是寬表的 basic_eps_from_continuing_ops：
// 總數覆蓋率約兩倍（113 年 1,868 vs 943），且有停業單位的公司兩者不同（108~114 年 75 筆）。
// 單季表的第四季 EPS 一律是 null（加權平均股數不能相減，mops-ts 不推導），所以年度 EPS 只能從這裡來。
export const mopsAnnualReports: AnnualReportPort = {
  getAnnualIncomeStatement: async ({ symbol, rocYear, dataType, subsidiaryCompanyId }) => {
    const rows = await mopsExportPrisma.$queryRaw<{ report_date: Date | null; basic_eps: string | null }[]>`
      SELECT MAX(fiscal_period_end_date) AS report_date,
             MAX(value) FILTER (WHERE account_code = 'basic_earnings_loss_per_share') AS basic_eps
      FROM "export"."xbrl_three_statements_long"
      WHERE symbol = ${symbol} AND year = ${rocYear} AND quarter = 4
        AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
        AND statement_type = 'income_statement_cumulative'`;
    const row = rows[0];
    if (!row?.report_date) return null;
    return { reportDate: row.report_date, basicEps: row.basic_eps === null ? null : Number(row.basic_eps) };
  },
};
