import type { FinancialStatementsPort } from '@/application/ports/financialStatements';
import type { QuarterResolverPort } from '@/application/ports/quarterResolver';
import type { XbrlAccountsPort } from '@/application/ports/xbrlAccounts';
import { getBalanceSheetXbrlFirst, getLatestQuarterWithBalanceSheetXbrl } from './balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst, getLatestQuarterWithIncomeStatementXbrl } from './incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst } from './cashFlowStatementXbrlFirst';
import { getInsuranceIncomeStatementXbrlFirst, getLatestQuarterWithInsuranceIncomeStatement } from './insuranceIncomeStatementXbrlFirst';
import { getLatestQuarterWithXbrlCashFlowQuarterly, getXbrlCashFlowQuarterly } from './xbrlCashFlowQuarterly';
import {
  getBankAssetQualityTotalLoans,
  getBankCapitalAdequacy,
  getLatestQuarterWithBankAssetQuality,
  getLatestQuarterWithBankCapitalAdequacy,
} from './bankRegulatoryXbrl';
import { getBankIncomeStatementQuarter, getLatestQuarterWithBankIncomeStatement } from './bankIncomeStatementXbrl';
import { getResearchAndDevelopmentExpense } from './incomeStatementXbrlExtra';

// XBRL 寬表/長表對 application/ports 三個財報相關 port 的實作——只是把既有的查詢函式綁到介面的
// 方法名上，查詢本身在各自的檔案。src/bootstrap/pitDeps.ts 拿這些物件組 PitDeps。

export const xbrlFinancialStatements: FinancialStatementsPort = {
  getIncomeStatement: getIncomeStatementXbrlFirst,
  getBalanceSheet: getBalanceSheetXbrlFirst,
  getCashFlowStatement: getCashFlowStatementXbrlFirst,
  getInsuranceIncomeStatement: getInsuranceIncomeStatementXbrlFirst,
  getBankAssetQuality: getBankAssetQualityTotalLoans,
  getBankCapitalAdequacy,
  getBankIncomeStatement: getBankIncomeStatementQuarter,
};

// 2026-09-11：舊三大表（mopsQuarterlyStatements.ts）已退役，這裡單純查 XBRL 寬表最新一季，
// 不再跟舊表的最新一季取較新值。
export const xbrlQuarterResolver: QuarterResolverPort = {
  latestQuarterWith: (source, symbol, dataType, subsidiaryCompanyId) => {
    switch (source) {
      case 'balanceSheet':
        return getLatestQuarterWithBalanceSheetXbrl(symbol, dataType, subsidiaryCompanyId);
      case 'incomeStatement':
        return getLatestQuarterWithIncomeStatementXbrl(symbol, dataType, subsidiaryCompanyId);
      case 'cashFlowStatement':
        return getLatestQuarterWithXbrlCashFlowQuarterly(symbol, dataType, subsidiaryCompanyId);
      case 'insuranceIncomeStatement':
        return getLatestQuarterWithInsuranceIncomeStatement(symbol, dataType, subsidiaryCompanyId);
      case 'bankAssetQuality':
        return getLatestQuarterWithBankAssetQuality(symbol, dataType, subsidiaryCompanyId);
      case 'bankCapitalAdequacy':
        return getLatestQuarterWithBankCapitalAdequacy(symbol, dataType, subsidiaryCompanyId);
      case 'bankIncomeStatement':
        return getLatestQuarterWithBankIncomeStatement(symbol, dataType, subsidiaryCompanyId);
    }
  },
};

export const xbrlAccounts: XbrlAccountsPort = {
  getCashFlowAccounts: getXbrlCashFlowQuarterly,
  getResearchAndDevelopmentExpense,
};
