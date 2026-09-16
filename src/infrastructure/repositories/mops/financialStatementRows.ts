import type { FinancialStatementRowsPort } from '@/application/ports/financialStatementRows';
import { getBalanceSheetXbrlFull } from './balanceSheetXbrlFull';
import { getIncomeStatementXbrlFull } from './incomeStatementXbrlFull';

// application/ports/financialStatementRows.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const mopsFinancialStatementRows: FinancialStatementRowsPort = {
  getBalanceSheetRow: getBalanceSheetXbrlFull,
  getIncomeStatementRow: getIncomeStatementXbrlFull,
};
