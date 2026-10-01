import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { CumulativeStatementsPort } from '@/application/ports/cumulativeStatements';
import { INCOME_STATEMENT_XBRL_COLUMNS, mapXbrlRow, type RawIncomeStatementXbrlRow } from './incomeStatementXbrlFirst';
import { getXbrlCashFlow } from './xbrlCashFlowQuarterly';
import { toCashFlowFields } from './cashFlowStatementXbrlFirst';

// 累計（年初至該季）損益表與現金流量表，見 application/ports/cumulativeStatements.ts。欄位與 mapper 跟單季讀取共用，
// 只差讀哪張表：損益表讀累計寬表 cumulative_income_statement_xbrl、現金流量表讀長表 statement_type='cash_flow'。
// 累計寬表的 Q4 有兩種來源（年報文件 'document'、四個單季相加 'derived_from_quarters'，見 annualReport.ts）；這裡不過濾——
// 半年頻只用在興櫃，興櫃沒有單季可加，Q4 只會是年報文件列；Q2 只有文件列。
export const mopsCumulativeStatements: CumulativeStatementsPort = {
  getCumulativeIncomeStatement: async ({ symbol, year, quarter, dataType, subsidiaryCompanyId }) => {
    const rows = await mopsExportPrisma.$queryRaw<RawIncomeStatementXbrlRow[]>`
      SELECT ${INCOME_STATEMENT_XBRL_COLUMNS}
      FROM "export"."cumulative_income_statement_xbrl"
      WHERE symbol = ${symbol} AND year = ${year} AND quarter = ${quarter}
        AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
      LIMIT 1`;
    return rows[0] ? mapXbrlRow(rows[0]) : null;
  },
  getCumulativeCashFlowStatement: async (key) => {
    const xbrl = await getXbrlCashFlow(key, 'cash_flow');
    return xbrl ? toCashFlowFields(xbrl) : null;
  },
};
