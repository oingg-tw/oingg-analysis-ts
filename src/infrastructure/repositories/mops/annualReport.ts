import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { AnnualReportPort } from '@/application/ports/annualReport';
import { INCOME_STATEMENT_XBRL_COLUMNS, mapXbrlRow, type RawIncomeStatementXbrlRow } from './incomeStatementXbrlFirst';

// 年報 = mops-ts 累計表的 quarter=4（累計到第四季 = 全年）且是年報文件列（見下）。全年金額讀累計寬表
// （跟單季寬表同一組欄位、共用 mapper）；年報 EPS 讀長表 income_statement_cumulative。
// 他們另開明確的 export.annual_income_statement 之後改讀那裡。
// EPS 讀 `basic_earnings_loss_per_share`（總數）而不是寬表的 basic_eps_from_continuing_ops：
// 總數覆蓋率約兩倍（113 年 1,868 vs 943），且有停業單位的公司兩者不同（108~114 年 75 筆）。
// 單季表的第四季 EPS 一律是 null（加權平均股數不能相減，mops-ts 不推導），所以年度 EPS 只能從這裡來。
//
// **累計表的第四季不一定是年報**（2026-09-25 mops-ts 查明）：沒 ingest 過年報文件的公司，他們的
// backfill-cumulative-income-statement-xbrl.ts 會用「四個單季相加」補一列累計第四季（EPS 刻意 null），
// 114 年有 773 列是這種。那正是使用者要求不能當年報的東西——年報必須來自年報文件、不從季資料拼。
// 分辨方式：累計寬表的 `source` 欄位（mops-ts 2026-09-25 開到 export，兩個寫入者都明確寫入——ingest 寫 'document'、
// 推導腳本寫 'derived_from_quarters'，沒有第三值、沒有 null）。這裡只認 'document'，推導列一律當成「沒有年報」回 null。
// 在這之前是靠 raw_context_ref IS NOT NULL 間接推斷（回答的是「解析出什麼」不是「來源是什麼」，只是剛好精確），
// 同日換成讀來源欄位——判準從巧合變成契約。
export const mopsAnnualReports: AnnualReportPort = {
  getAnnualIncomeStatement: async ({ symbol, rocYear, dataType, subsidiaryCompanyId }) => {
    // 全年金額：累計寬表第四季、只認年報文件列（source = 'document'）。欄位與 mapper 跟單季讀取共用。
    const rows = await mopsExportPrisma.$queryRaw<RawIncomeStatementXbrlRow[]>`
      SELECT ${INCOME_STATEMENT_XBRL_COLUMNS}
      FROM "export"."cumulative_income_statement_xbrl"
      WHERE symbol = ${symbol} AND year = ${rocYear} AND quarter = 4
        AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
        AND source = 'document'
      LIMIT 1`;
    if (!rows[0]) return null;
    // 年報 EPS 總數只在長表（寬表只有 continuing ops，見檔頭）。
    const eps = await mopsExportPrisma.$queryRaw<{ value: string }[]>`
      SELECT value FROM "export"."xbrl_three_statements_long"
      WHERE symbol = ${symbol} AND year = ${rocYear} AND quarter = 4
        AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
        AND statement_type = 'income_statement_cumulative' AND account_code = 'basic_earnings_loss_per_share'
      LIMIT 1`;
    return { ...mapXbrlRow(rows[0]), basicEps: eps[0] ? Number(eps[0].value) : null };
  },
};
