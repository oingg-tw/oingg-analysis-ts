// 損益表依賴指標的查詢層——2026-09-11 舊三大表（quarterly_income_statement，
// mopsQuarterlyStatements.ts）已退役，改為單純查 XBRL 寬表（export.quarterly_income_statement_xbrl），
// 不再有 fallback 分支，理由見 balanceSheetXbrlFirst.ts 的說明。
// 2026-09-07 用 2330 115Q2 逐欄位交叉驗證過 11 個欄位跟舊表完全一致：operatingIncome
// 對應 profit_loss_from_operating_activities（不是 gross_profit_loss_from_operations，
// 那個候選其實等於 gross_profit，是另一個概念的別名）；incomeTaxExpense 對應
// income_tax_expense_continuing_operations，沿用 guru/roic 批次已驗證過的對照。
//
// 31 支既有 computeXxxPit.ts 只透過 getIncomeStatementXbrlFirst(key) 存取以下 11 個欄位 +
// reportDate（eps／interestIncome 完全沒有任何檔案存取，這裡不處理——EPS 是各自用
// 淨利/流通股數重新算的，不是讀這張表現成的 eps 欄位）。

import type { QuarterlyKey } from '../quarterlyKey';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

export interface IncomeStatementFields {
  reportDate: Date;
  operatingRevenue: bigint | null;
  grossProfit: bigint | null;
  operatingIncome: bigint | null;
  profitBeforeTax: bigint | null;
  netIncome: bigint | null;
  adminExpenses: bigint | null;
  financeCosts: bigint | null;
  incomeTaxExpense: bigint | null;
  netIncomeAttributableToParent: bigint | null;
  operatingCost: bigint | null;
  sellingExpenses: bigint | null;
}

interface RawIncomeStatementXbrlRow {
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
}

const mapXbrlRow = (row: RawIncomeStatementXbrlRow): IncomeStatementFields => ({
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
});

export const getLatestQuarterWithIncomeStatementXbrl = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getIncomeStatementXbrlFirst = async (key: QuarterlyKey): Promise<IncomeStatementFields | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawIncomeStatementXbrlRow[]>`
    SELECT report_date, revenue, gross_profit, profit_loss_from_operating_activities, profit_loss_before_tax,
      profit_loss, administrative_expense, finance_costs, income_tax_expense_continuing_operations,
      profit_loss_attributable_to_owners_of_parent, operating_costs, selling_expense
    FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;

  return rows[0] ? mapXbrlRow(rows[0]) : null;
};
