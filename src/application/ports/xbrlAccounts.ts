import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';

// 三大表寬表（financialStatements.ts）以外、少數指標直接讀 XBRL 原始科目的 port：
// - 現金流量表長表的全部 account_code → 金額（buybackYield/shareholderYield 要讀寬表沒有的
//   庫藏股/發行股票科目）。
// - 損益表寬表的研發費用（rdIntensity/priceToResearchRatio）。
// 實作在 infrastructure/repositories/mops/financialStatementPorts.ts。

export interface XbrlCashFlowAccounts {
  reportDate: Date;
  // account_code -> 金額（千元，bigint）。長表本身 value 欄位是 text，repository 統一轉成 bigint。
  accounts: Record<string, bigint>;
}

export interface XbrlAccountsPort {
  getCashFlowAccounts(key: QuarterlyKey): Promise<XbrlCashFlowAccounts | null>;
  getResearchAndDevelopmentExpense(key: QuarterlyKey): Promise<bigint | null>;
}
