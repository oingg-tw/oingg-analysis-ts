// 現金流量表依賴指標的查詢層——2026-09-11 舊三大表（quarterly_cash_flow_statement，
// mopsQuarterlyStatements.ts）已退役，改為單純查 XBRL（export.xbrl_three_statements_long
// 的 statement_type='cash_flow_quarterly'，見 xbrlCashFlowQuarterly.ts），不再有
// fallback 分支，理由見 balanceSheetXbrlFirst.ts 的說明。
// 2026-09-06/07 用 2330 115Q1/115Q2 逐欄位交叉驗證過 5 個欄位（netCashFromOperatingActivities/
// capitalExpenditures/depreciation/amortization/dividendsPaid）跟舊表完全一致。
//
// netCashFromInvestingActivities：mops-ts 2026-09-11 澄清原本以為沒有對應單一 XBRL
// account_code 是誤判——`net_cash_flows_from_used_in_investing_activities`
//（tifrs-SCF:NetCashFlowsFromUsedInInvestingActivities）本來就是原生申報欄位，長表
// 一直都有，只是兩張寬表（quarterly/cumulative_cash_flow_statement_xbrl）漏了這欄，
// mops-ts 已補上。改為優先採原生欄位；只有原生欄位缺漏時才退回會計恆等式反推
// （淨投資現金流 = 現金及約當現金淨增減 - CFO - CFF - 匯率影響，缺任一項就回傳 null，
// 匯率影響缺漏視為 0）——用 2330 115Q2 真實資料驗證過兩者算出來的數字完全一致
// （-492,810,418），保留 fallback 是為了涵蓋原生欄位還沒補齊的舊季度。
//
// 14 支既有 computeXxxPit.ts 都只透過 getCashFlowStatementXbrlFirst(key) 存取這 6 個
// 欄位 + reportDate。

import type { QuarterlyKey } from '../../../domain/financials/quarterlyKey';
import { getXbrlCashFlowQuarterly } from './xbrlCashFlowQuarterly';
import type { CashFlowFields } from '@/application/ports/financialStatements';

// CashFlowFields 2026-09-17 Phase 3 搬到 application/ports/financialStatements.ts（port 的 DTO），這裡 re-export 給既有 import 路徑。
export type { CashFlowFields };

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
    netCashFromInvestingActivities:
      xbrl.accounts.net_cash_flows_from_used_in_investing_activities ?? deriveNetCashFromInvestingActivities(xbrl.accounts),
  };
};
