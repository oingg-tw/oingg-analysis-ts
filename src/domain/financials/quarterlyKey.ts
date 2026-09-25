// 2026-09-11：從已退役的 mopsQuarterlyStatements.ts 搬出來的共用型別——這個形狀本身
// 不是舊三大表專屬的，是整個 XBRL-first 查詢層（balanceSheetXbrlFirst.ts/
// incomeStatementXbrlFirst.ts/cashFlowStatementXbrlFirst.ts/insuranceIncomeStatementXbrlFirst.ts
// 等）共用的查詢鍵形狀，退役舊表不代表這個型別也要跟著消失。
// quarter=1~4 永遠是**單季**——第四季是「年報全年 − 第三季累計」推出來的單季，絕不代表全年。
// 年報（全年數字、官方 EPS）是另一個概念，不能用 quarter: 4 去撈（2026-09-25 使用者拍板，
// 見 UBIQUITOUS_LANGUAGE.md〈三、期間口徑〉）。
export interface QuarterlyKey {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}
