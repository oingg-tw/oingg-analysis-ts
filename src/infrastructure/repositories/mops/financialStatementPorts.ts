import type { FinancialStatementsPort } from '@/application/ports/financialStatements';
import type { QuarterResolverPort } from '@/application/ports/quarterResolver';
import { getBalanceSheetXbrlFirst, getLatestQuarterWithBalanceSheetXbrl } from './balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst, getLatestQuarterWithIncomeStatementXbrl } from './incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst } from './cashFlowStatementXbrlFirst';
import { getInsuranceIncomeStatementXbrlFirst } from './insuranceIncomeStatementXbrlFirst';
import { getLatestQuarterWithXbrlCashFlowQuarterly } from './xbrlCashFlowQuarterly';

// XBRL 寬表對 application/ports 兩個財報 port 的實作——只是把既有的查詢函式綁到介面的方法名上，
// 查詢本身在各自的 *XbrlFirst.ts。src/bootstrap/pitDeps.ts 拿這兩個物件組 PitDeps。

export const xbrlFinancialStatements: FinancialStatementsPort = {
  getIncomeStatement: getIncomeStatementXbrlFirst,
  getBalanceSheet: getBalanceSheetXbrlFirst,
  getCashFlowStatement: getCashFlowStatementXbrlFirst,
  getInsuranceIncomeStatement: getInsuranceIncomeStatementXbrlFirst,
};

// 2026-09-11：舊三大表（mopsQuarterlyStatements.ts）已退役，這裡單純查 XBRL 寬表最新一季，
// 不再跟舊表的最新一季取較新值。
export const xbrlQuarterResolver: QuarterResolverPort = {
  latestQuarterWith: (source, symbol, dataType, subsidiaryCompanyId) => {
    if (source === 'balanceSheet') return getLatestQuarterWithBalanceSheetXbrl(symbol, dataType, subsidiaryCompanyId);
    if (source === 'incomeStatement') return getLatestQuarterWithIncomeStatementXbrl(symbol, dataType, subsidiaryCompanyId);
    return getLatestQuarterWithXbrlCashFlowQuarterly(symbol, dataType, subsidiaryCompanyId);
  },
};
