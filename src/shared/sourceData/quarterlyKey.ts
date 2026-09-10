// 2026-09-11：從已退役的 mopsQuarterlyStatements.ts 搬出來的共用型別——這個形狀本身
// 不是舊三大表專屬的，是整個 XBRL-first 查詢層（balanceSheetXbrlFirst.ts/
// incomeStatementXbrlFirst.ts/cashFlowStatementXbrlFirst.ts/insuranceIncomeStatementXbrlFirst.ts
// 等）共用的查詢鍵形狀，退役舊表不代表這個型別也要跟著消失。
export interface QuarterlyKey {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}
