import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';

// 「會計模式」（GET /companies/financial-statement）用的整列透傳 port：資產負債表/損益表 XBRL 寬表的
// 一整列（SELECT *，不挑欄位），跟指標核心用的 FinancialStatementsPort（挑好欄位的正規化列）刻意分開——
// 這裡要的是「這張表全部科目」，欄位集合會隨 mops-ts 的 view 擴充，不該在 application 列舉。
// 現金流量表沒有寬表（長表格式），走 XbrlAccountsPort.getCashFlowAccounts 再由 use case 攤平。
// 回傳 object（不是 Record<string, unknown>）：取用時用 Object.entries 轉成一般物件遍歷。
// 實作在 infrastructure/repositories/mops/financialStatementRows.ts。
export interface FinancialStatementRowsPort {
  getBalanceSheetRow(key: QuarterlyKey): Promise<object | null>;
  getIncomeStatementRow(key: QuarterlyKey): Promise<object | null>;
}
