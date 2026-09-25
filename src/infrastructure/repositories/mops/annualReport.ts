import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { AnnualReportPort } from '@/application/ports/annualReport';

// 年報 = mops-ts 長表 statement_type='income_statement_cumulative' 的 quarter=4（累計到第四季 = 全年），
// mops-ts 2026-09-25 確認這個定義可以依賴；他們另開明確的 export.annual_income_statement 之後改讀那裡。
// EPS 讀 `basic_earnings_loss_per_share`（總數）而不是寬表的 basic_eps_from_continuing_ops：
// 總數覆蓋率約兩倍（113 年 1,868 vs 943），且有停業單位的公司兩者不同（108~114 年 75 筆）。
// 單季表的第四季 EPS 一律是 null（加權平均股數不能相減，mops-ts 不推導），所以年度 EPS 只能從這裡來。
//
// **累計表的第四季不一定是年報**（2026-09-25 mops-ts 查明）：沒 ingest 過年報文件的公司，他們的
// backfill-cumulative-income-statement-xbrl.ts 會用「四個單季相加」補一列累計第四季（EPS 刻意 null），
// 114 年有 773 列是這種。那正是使用者要求不能當年報的東西——年報必須來自年報文件、不從季資料拼。
// 分辨方式：寬表 raw_context_ref 是 null ＝ 推導列（沒有文件可解析）。這裡只認有 context 的文件列，
// 推導列一律當成「沒有年報」回 null。長表沒有這欄，所以用寬表判斷。
export const mopsAnnualReports: AnnualReportPort = {
  getAnnualIncomeStatement: async ({ symbol, rocYear, dataType, subsidiaryCompanyId }) => {
    const rows = await mopsExportPrisma.$queryRaw<{ report_date: Date | null; basic_eps: string | null }[]>`
      SELECT MAX(fiscal_period_end_date) AS report_date,
             MAX(value) FILTER (WHERE account_code = 'basic_earnings_loss_per_share') AS basic_eps
      FROM "export"."xbrl_three_statements_long"
      WHERE symbol = ${symbol} AND year = ${rocYear} AND quarter = 4
        AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
        AND statement_type = 'income_statement_cumulative'
        AND EXISTS (
          SELECT 1 FROM "export"."cumulative_income_statement_xbrl" w
          WHERE w.symbol = ${symbol} AND w.year = ${rocYear} AND w.quarter = 4
            AND w.data_type = ${dataType} AND w.subsidiary_company_id = ${subsidiaryCompanyId}
            AND w.raw_context_ref IS NOT NULL)`;
    const row = rows[0];
    if (!row?.report_date) return null;
    return { reportDate: row.report_date, basicEps: row.basic_eps === null ? null : Number(row.basic_eps) };
  },
};
