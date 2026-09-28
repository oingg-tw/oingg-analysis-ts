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
import { resolveNetCashFromInvestingActivities } from '@/domain/financials/cashFlowIdentity';
import type { CashFlowFields } from '@/application/ports/financialStatements';

// CashFlowFields 2026-09-17 Phase 3 搬到 application/ports/financialStatements.ts（port 的 DTO），這裡 re-export 給既有 import 路徑。
export type { CashFlowFields };

export const getCashFlowStatementXbrlFirst = async (key: QuarterlyKey): Promise<CashFlowFields | null> => {
  const xbrl = await getXbrlCashFlowQuarterly(key);
  if (!xbrl) return null;

  return {
    reportDate: xbrl.reportDate,
    netCashFromOperatingActivities: xbrl.accounts.cash_flows_from_used_in_operating_activities ?? null,
    capitalExpenditures: xbrl.accounts.purchase_of_ppe_investing ?? null,
    depreciation: xbrl.accounts.adj_depreciation_expense ?? null,
    amortization: xbrl.accounts.adj_amortisation_expense ?? null,
    // 2026-09-28 股利發放 = 籌資活動＋營業活動兩處相加（mops-ts 補收 dividends_paid_operating 後確認可以相加）：
    // 11 家（2483、3581、4994、5203、6223…）把支付股利列在營業活動，之前只讀籌資活動，這幾家的股利類指標看不到股利。
    // 照申報存（壓倒性為負，16,083 負 vs 25 正），**先相加**，呼叫端再對總和取絕對值——不能各自取絕對值（正值若是收回會加錯方向）。
    // 兩處都缺才是 null（科目 null = 那一季沒發，跟 mops 確認過的語意一致）。
    dividendsPaid:
      xbrl.accounts.dividends_paid_financing === undefined && xbrl.accounts.dividends_paid_operating === undefined
        ? null
        : (xbrl.accounts.dividends_paid_financing ?? 0n) + (xbrl.accounts.dividends_paid_operating ?? 0n),
    netCashFromInvestingActivities: resolveNetCashFromInvestingActivities(xbrl.accounts),
  };
};
