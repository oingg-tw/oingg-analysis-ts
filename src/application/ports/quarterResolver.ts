// 「這家公司某張財報最新到哪一季」port——application/financials/latestQuarter.ts 的
// getLatestAvailableQuarter/resolveQuarterOrLatest 拿多張表各自的最新一季取交集下界，這裡只負責
// 單張表的查詢。實作在 infrastructure/repositories/mops/financialStatementPorts.ts（XBRL 寬表）。
//
// 三大表以外的來源：insuranceIncomeStatement（保險業 IFRS17 替代科目，margins 家族的 fallback 用）、
// bankAssetQuality/bankCapitalAdequacy/bankIncomeStatement（銀行監理揭露，三個 bank family 用）——
// 舊架構各自有一支 getLatestQuarterWithXxx，形狀完全一樣，統一成同一個方法的不同 source。
export type StatementSource =
  | 'balanceSheet'
  | 'incomeStatement'
  | 'cashFlowStatement'
  | 'insuranceIncomeStatement'
  | 'bankAssetQuality'
  | 'bankCapitalAdequacy'
  | 'bankIncomeStatement';

export interface LatestQuarter {
  year: number; // 民國年
  quarter: number; // 1~4
}

export interface QuarterResolverPort {
  latestQuarterWith(source: StatementSource, symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<LatestQuarter | null>;
}
