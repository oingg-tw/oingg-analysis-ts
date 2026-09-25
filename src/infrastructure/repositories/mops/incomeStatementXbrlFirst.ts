// 損益表依賴指標的查詢層——2026-09-11 舊三大表（quarterly_income_statement，
// mopsQuarterlyStatements.ts）已退役，改為單純查 XBRL 寬表（export.quarterly_income_statement_xbrl），
// 不再有 fallback 分支，理由見 balanceSheetXbrlFirst.ts 的說明。
// 2026-09-07 用 2330 115Q2 逐欄位交叉驗證過 11 個欄位跟舊表完全一致：operatingIncome
// 對應 profit_loss_from_operating_activities（不是 gross_profit_loss_from_operations，
// 那個候選其實等於 gross_profit，是另一個概念的別名）；incomeTaxExpense 對應
// income_tax_expense_continuing_operations，沿用 guru/roic 批次已驗證過的對照。
//
// 既有 computeXxxPit.ts 只透過 getIncomeStatementXbrlFirst(key) 存取以下欄位 + reportDate（eps／
// interestIncome 完全沒有任何檔案存取，這裡不處理——EPS 是各自用淨利/流通股數重新算的，不是讀
// 這張表現成的 eps 欄位）。2026-09-18 補上 operating_expense（營業費用合計，給
// operatingExpensePerShare 用，跟 operating_costs/income_tax_expense_continuing_operations 一樣
// 是真實揭露的單一總計科目）。
// 2026-09-24 再補 5 個欄位給「營收→股利」瀑布圖的業外與營業費用拆解用：research_and_development_expense、
// revenue_from_interest、other_revenue、other_gains_losses、share_of_profit_loss_of_associates_and_jvs。
// 全部在同一列，加進既有 SELECT 不增加查詢次數——研發費用先前是 incomeStatementXbrlExtra.ts 單獨再查一次，
// 那支還有 rdIntensity/priceToResearchRatio 在用，沿用不動（TTM 要四季，走這裡可以少四次往返）。

import type { QuarterlyKey } from '../../../domain/financials/quarterlyKey';
import { Prisma } from '#generated/mops-export-client';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { IncomeStatementFields } from '@/application/ports/financialStatements';

// IncomeStatementFields 2026-09-17 Phase 3 搬到 application/ports/financialStatements.ts（port 的 DTO），這裡 re-export 給既有 import 路徑。
export type { IncomeStatementFields };

// 2026-09-25 年報讀取（annualReport.ts）跟這裡讀同一組欄位（累計寬表的欄位名相同），共用欄位清單與 mapper。
export interface RawIncomeStatementXbrlRow {
  report_date: Date;
  revenue: bigint | null;
  gross_profit: bigint | null;
  profit_loss_from_operating_activities: bigint | null;
  profit_loss_before_tax: bigint | null;
  profit_loss: bigint | null;
  administrative_expense: bigint | null;
  finance_costs: bigint | null;
  income_tax_expense_continuing_operations: bigint | null;
  profit_loss_attributable_to_owners_of_parent: bigint | null;
  operating_costs: bigint | null;
  selling_expense: bigint | null;
  operating_expense: bigint | null;
  research_and_development_expense: bigint | null;
  revenue_from_interest: bigint | null;
  other_revenue: bigint | null;
  other_gains_losses: bigint | null;
  share_of_profit_loss_of_associates_and_jvs: bigint | null;
  net_other_income_expenses: bigint | null;
  impairment_loss_gain_reversal_ifrs9: bigint | null;
}

export const mapXbrlRow = (row: RawIncomeStatementXbrlRow): IncomeStatementFields => ({
  reportDate: row.report_date,
  operatingRevenue: row.revenue,
  grossProfit: row.gross_profit,
  operatingIncome: row.profit_loss_from_operating_activities,
  profitBeforeTax: row.profit_loss_before_tax,
  netIncome: row.profit_loss,
  adminExpenses: row.administrative_expense,
  financeCosts: row.finance_costs,
  incomeTaxExpense: row.income_tax_expense_continuing_operations,
  netIncomeAttributableToParent: row.profit_loss_attributable_to_owners_of_parent,
  operatingCost: row.operating_costs,
  sellingExpenses: row.selling_expense,
  operatingExpense: row.operating_expense,
  researchAndDevelopmentExpense: row.research_and_development_expense,
  interestIncome: row.revenue_from_interest,
  otherIncome: row.other_revenue,
  otherGainsLosses: row.other_gains_losses,
  equityMethodIncome: row.share_of_profit_loss_of_associates_and_jvs,
  netOtherIncomeExpenses: row.net_other_income_expenses,
  expectedCreditLoss: row.impairment_loss_gain_reversal_ifrs9,
});

export const getLatestQuarterWithIncomeStatementXbrl = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

export const INCOME_STATEMENT_XBRL_COLUMNS = Prisma.raw(
  'report_date, revenue, gross_profit, profit_loss_from_operating_activities, profit_loss_before_tax, ' +
    'profit_loss, administrative_expense, finance_costs, income_tax_expense_continuing_operations, ' +
    'profit_loss_attributable_to_owners_of_parent, operating_costs, selling_expense, operating_expense, ' +
    'research_and_development_expense, revenue_from_interest, other_revenue, other_gains_losses, ' +
    'share_of_profit_loss_of_associates_and_jvs, net_other_income_expenses, impairment_loss_gain_reversal_ifrs9'
);

export const getIncomeStatementXbrlFirst = async (key: QuarterlyKey): Promise<IncomeStatementFields | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawIncomeStatementXbrlRow[]>`
    SELECT ${INCOME_STATEMENT_XBRL_COLUMNS}
    FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;

  return rows[0] ? mapXbrlRow(rows[0]) : null;
};
