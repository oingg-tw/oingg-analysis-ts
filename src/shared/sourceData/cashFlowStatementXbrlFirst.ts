// 現金流量表依賴指標的查詢層——2026-09-11 舊三大表（quarterly_cash_flow_statement，
// mopsQuarterlyStatements.ts）已退役，改為單純查 XBRL（export.xbrl_three_statements_long
// 的 statement_type='cash_flow_quarterly'，見 xbrlCashFlowQuarterly.ts），不再有
// fallback 分支，理由見 balanceSheetXbrlFirst.ts 的說明。
// 2026-09-06/07 用 2330 115Q1/115Q2 逐欄位交叉驗證過 5 個欄位（netCashFromOperatingActivities/
// capitalExpenditures/depreciation/amortization/dividendsPaid）跟舊表完全一致；
// netCashFromInvestingActivities 沒有對應的單一 XBRL account_code（investing activities
// 沒有小計標籤，只有一堆個別項目、沒有保證窮舉的清單），改用會計恆等式反推：
// 淨投資現金流 = 現金及約當現金淨增減 - CFO - CFF - 匯率影響，同樣驗證過完全一致。
//
// 14 支既有 computeXxxPit.ts 都只透過 getCashFlowStatementXbrlFirst(key) 存取這 6 個
// 欄位 + reportDate。

import type { QuarterlyKey } from './quarterlyKey';
import { getXbrlCashFlowQuarterly } from './xbrlCashFlowQuarterly';

export interface CashFlowFields {
  reportDate: Date;
  netCashFromOperatingActivities: bigint | null;
  capitalExpenditures: bigint | null;
  depreciation: bigint | null;
  amortization: bigint | null;
  dividendsPaid: bigint | null;
  netCashFromInvestingActivities: bigint | null;
}

// 淨投資現金流 = 現金及約當現金淨增減 - CFO - CFF - 匯率影響（會計恆等式，不是猜哪些
// investing 個別項目要加總）。前三項（淨增減/CFO/CFF）是每家公司都會揭露的小計，缺任一項
// 就直接回傳 null，不勉強；匯率影響缺漏視為 0（沒有這個 XBRL 標籤，合理解讀成沒有匯率
// 影響，比照 bankCapitalAdequacy 對「沒有借那種負債」欄位的判斷精神）。
const deriveNetCashFromInvestingActivities = (accounts: Record<string, bigint>): bigint | null => {
  const netChangeInCash = accounts.increase_decrease_in_cash_and_cash_equivalents;
  const cfo = accounts.cash_flows_from_used_in_operating_activities;
  const cff = accounts.cash_flows_from_used_in_financing_activities;
  if (netChangeInCash === undefined || cfo === undefined || cff === undefined) return null;
  const fxEffect = accounts.effect_of_exchange_rate_changes_on_cash_and_cash_equivalents ?? 0n;
  return netChangeInCash - cfo - cff - fxEffect;
};

export const getCashFlowStatementXbrlFirst = async (key: QuarterlyKey): Promise<CashFlowFields | null> => {
  const xbrl = await getXbrlCashFlowQuarterly(key);
  if (!xbrl) return null;

  return {
    reportDate: xbrl.reportDate,
    netCashFromOperatingActivities: xbrl.accounts.cash_flows_from_used_in_operating_activities ?? null,
    capitalExpenditures: xbrl.accounts.purchase_of_ppe_investing ?? null,
    depreciation: xbrl.accounts.adj_depreciation_expense ?? null,
    amortization: xbrl.accounts.adj_amortisation_expense ?? null,
    dividendsPaid: xbrl.accounts.dividends_paid_financing ?? null,
    netCashFromInvestingActivities: deriveNetCashFromInvestingActivities(xbrl.accounts),
  };
};
