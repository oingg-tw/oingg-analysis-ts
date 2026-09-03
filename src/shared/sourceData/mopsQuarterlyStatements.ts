// mops-ts export schema 的即時查詢層——2026-09-03 使用者決定 curated 中台層現階段太早，
// 三張季報表（quarterly_income_statement/quarterly_balance_sheet/quarterly_cash_flow_statement）
// 一律改成每次直接查 mopsExportPrisma（etl_reader，只讀 export schema），不落地存副本。
// 這幾張 view 沒有唯一識別欄位，Prisma Client 不會產生 model 存取子，一律走 $queryRaw，見
// prisma/mopsExport/schema.prisma 開頭的說明。
//
// 提供的函式形狀刻意比照原本 Prisma model 呼叫方式（單筆查詢/依 symbol+dataType+subsidiary
// 找最新一季/列出全部 symbol），讓 33 個消費端（roe、altmanZScore…）不用各自重寫查詢邏輯，
// 只要把 `prisma.quarterlyXxx.findUnique(...)` 換成這裡對應的函式呼叫。

import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

export interface QuarterlyKey {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}

// ---------------------------------------------------------------------------
// quarterly_income_statement
// ---------------------------------------------------------------------------

export interface QuarterlyIncomeStatementRow {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
  reportDate: Date;
  operatingRevenue: bigint | null;
  grossProfit: bigint | null;
  operatingIncome: bigint | null;
  profitBeforeTax: bigint | null;
  netIncome: bigint | null;
  eps: string | null;
  adminExpenses: bigint | null;
  comprehensiveIncomeAttributableToNci: bigint | null;
  comprehensiveIncomeAttributableToParent: bigint | null;
  epsDiluted: string | null;
  financeCosts: bigint | null;
  grossProfitBeforeAdjustment: bigint | null;
  incomeTaxExpense: bigint | null;
  interestIncome: bigint | null;
  netIncomeAttributableToNci: bigint | null;
  netIncomeAttributableToParent: bigint | null;
  netIncomeFromContinuingOps: bigint | null;
  nonOperatingIncomeExpenses: bigint | null;
  operatingCost: bigint | null;
  operatingExpenses: bigint | null;
  otherComprehensiveIncome: bigint | null;
  otherIncome: bigint | null;
  otherNonOperatingGainsLosses: bigint | null;
  otherOperatingGainsLosses: bigint | null;
  rdExpenses: bigint | null;
  sellingExpenses: bigint | null;
  shareOfAssociatesJvProfit: bigint | null;
  totalComprehensiveIncome: bigint | null;
}

interface RawIncomeStatementRow {
  symbol: string;
  year: number;
  quarter: number;
  data_type: string;
  subsidiary_company_id: string | null;
  report_date: Date;
  operating_revenue: bigint | null;
  gross_profit: bigint | null;
  operating_income: bigint | null;
  profit_before_tax: bigint | null;
  net_income: bigint | null;
  eps: unknown;
  admin_expenses: bigint | null;
  comprehensive_income_attributable_to_nci: bigint | null;
  comprehensive_income_attributable_to_parent: bigint | null;
  eps_diluted: unknown;
  finance_costs: bigint | null;
  gross_profit_before_adjustment: bigint | null;
  income_tax_expense: bigint | null;
  interest_income: bigint | null;
  net_income_attributable_to_nci: bigint | null;
  net_income_attributable_to_parent: bigint | null;
  net_income_from_continuing_ops: bigint | null;
  non_operating_income_expenses: bigint | null;
  operating_cost: bigint | null;
  operating_expenses: bigint | null;
  other_comprehensive_income: bigint | null;
  other_income: bigint | null;
  other_non_operating_gains_losses: bigint | null;
  other_operating_gains_losses: bigint | null;
  rd_expenses: bigint | null;
  selling_expenses: bigint | null;
  share_of_associates_jv_profit: bigint | null;
  total_comprehensive_income: bigint | null;
}

const toDecimalString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const mapIncomeStatementRow = (row: RawIncomeStatementRow): QuarterlyIncomeStatementRow => ({
  symbol: row.symbol,
  year: row.year,
  quarter: row.quarter,
  dataType: row.data_type,
  subsidiaryCompanyId: row.subsidiary_company_id ?? '',
  reportDate: row.report_date,
  operatingRevenue: row.operating_revenue,
  grossProfit: row.gross_profit,
  operatingIncome: row.operating_income,
  profitBeforeTax: row.profit_before_tax,
  netIncome: row.net_income,
  eps: toDecimalString(row.eps),
  adminExpenses: row.admin_expenses,
  comprehensiveIncomeAttributableToNci: row.comprehensive_income_attributable_to_nci,
  comprehensiveIncomeAttributableToParent: row.comprehensive_income_attributable_to_parent,
  epsDiluted: toDecimalString(row.eps_diluted),
  financeCosts: row.finance_costs,
  grossProfitBeforeAdjustment: row.gross_profit_before_adjustment,
  incomeTaxExpense: row.income_tax_expense,
  interestIncome: row.interest_income,
  netIncomeAttributableToNci: row.net_income_attributable_to_nci,
  netIncomeAttributableToParent: row.net_income_attributable_to_parent,
  netIncomeFromContinuingOps: row.net_income_from_continuing_ops,
  nonOperatingIncomeExpenses: row.non_operating_income_expenses,
  operatingCost: row.operating_cost,
  operatingExpenses: row.operating_expenses,
  otherComprehensiveIncome: row.other_comprehensive_income,
  otherIncome: row.other_income,
  otherNonOperatingGainsLosses: row.other_non_operating_gains_losses,
  otherOperatingGainsLosses: row.other_operating_gains_losses,
  rdExpenses: row.rd_expenses,
  sellingExpenses: row.selling_expenses,
  shareOfAssociatesJvProfit: row.share_of_associates_jv_profit,
  totalComprehensiveIncome: row.total_comprehensive_income,
});

export const getQuarterlyIncomeStatement = async (key: QuarterlyKey): Promise<QuarterlyIncomeStatementRow | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawIncomeStatementRow[]>`
    SELECT * FROM "export"."quarterly_income_statement"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;
  return rows[0] ? mapIncomeStatementRow(rows[0]) : null;
};

export const getLatestQuarterWithIncomeStatement = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."quarterly_income_statement"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getAllIncomeStatementSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."quarterly_income_statement"`;
  return rows.map((r) => r.symbol);
};

// ---------------------------------------------------------------------------
// quarterly_balance_sheet
// ---------------------------------------------------------------------------

export interface QuarterlyBalanceSheetRow {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
  reportDate: Date;
  cashAndEquivalents: bigint | null;
  accountsReceivable: bigint | null;
  inventory: bigint | null;
  currentAssets: bigint | null;
  propertyPlantEquipment: bigint | null;
  investmentsUnderEquityMethod: bigint | null;
  intangibleAssets: bigint | null;
  nonCurrentAssets: bigint | null;
  totalAssets: bigint | null;
  shortTermBorrowings: bigint | null;
  accountsPayable: bigint | null;
  currentLiabilities: bigint | null;
  bondsPayable: bigint | null;
  longTermBorrowings: bigint | null;
  nonCurrentLiabilities: bigint | null;
  totalLiabilities: bigint | null;
  capitalStock: bigint | null;
  preferredStockCapital: bigint | null;
  preferredStockLiability: bigint | null;
  capitalSurplus: bigint | null;
  retainedEarnings: bigint | null;
  otherEquity: bigint | null;
  treasuryStock: bigint | null;
  equityAttributableToParent: bigint | null;
  nonControllingInterest: bigint | null;
  totalEquity: bigint | null;
  totalLiabilitiesAndEquity: bigint | null;
}

interface RawBalanceSheetRow {
  symbol: string;
  year: number;
  quarter: number;
  data_type: string;
  subsidiary_company_id: string | null;
  report_date: Date;
  cash_and_equivalents: bigint | null;
  accounts_receivable: bigint | null;
  inventory: bigint | null;
  current_assets: bigint | null;
  property_plant_equipment: bigint | null;
  investments_under_equity_method: bigint | null;
  intangible_assets: bigint | null;
  non_current_assets: bigint | null;
  total_assets: bigint | null;
  short_term_borrowings: bigint | null;
  accounts_payable: bigint | null;
  current_liabilities: bigint | null;
  bonds_payable: bigint | null;
  long_term_borrowings: bigint | null;
  non_current_liabilities: bigint | null;
  total_liabilities: bigint | null;
  capital_stock: bigint | null;
  preferred_stock_capital: bigint | null;
  preferred_stock_liability: bigint | null;
  capital_surplus: bigint | null;
  retained_earnings: bigint | null;
  other_equity: bigint | null;
  treasury_stock: bigint | null;
  equity_attributable_to_parent: bigint | null;
  non_controlling_interest: bigint | null;
  total_equity: bigint | null;
  total_liabilities_and_equity: bigint | null;
}

const mapBalanceSheetRow = (row: RawBalanceSheetRow): QuarterlyBalanceSheetRow => ({
  symbol: row.symbol,
  year: row.year,
  quarter: row.quarter,
  dataType: row.data_type,
  subsidiaryCompanyId: row.subsidiary_company_id ?? '',
  reportDate: row.report_date,
  cashAndEquivalents: row.cash_and_equivalents,
  accountsReceivable: row.accounts_receivable,
  inventory: row.inventory,
  currentAssets: row.current_assets,
  propertyPlantEquipment: row.property_plant_equipment,
  investmentsUnderEquityMethod: row.investments_under_equity_method,
  intangibleAssets: row.intangible_assets,
  nonCurrentAssets: row.non_current_assets,
  totalAssets: row.total_assets,
  shortTermBorrowings: row.short_term_borrowings,
  accountsPayable: row.accounts_payable,
  currentLiabilities: row.current_liabilities,
  bondsPayable: row.bonds_payable,
  longTermBorrowings: row.long_term_borrowings,
  nonCurrentLiabilities: row.non_current_liabilities,
  totalLiabilities: row.total_liabilities,
  capitalStock: row.capital_stock,
  preferredStockCapital: row.preferred_stock_capital,
  preferredStockLiability: row.preferred_stock_liability,
  capitalSurplus: row.capital_surplus,
  retainedEarnings: row.retained_earnings,
  otherEquity: row.other_equity,
  treasuryStock: row.treasury_stock,
  equityAttributableToParent: row.equity_attributable_to_parent,
  nonControllingInterest: row.non_controlling_interest,
  totalEquity: row.total_equity,
  totalLiabilitiesAndEquity: row.total_liabilities_and_equity,
});

const BALANCE_SHEET_COLUMNS = `symbol, year, quarter, data_type, subsidiary_company_id, report_date, cash_and_equivalents,
  accounts_receivable, inventory, current_assets, property_plant_equipment, investments_under_equity_method,
  intangible_assets, non_current_assets, total_assets, short_term_borrowings, accounts_payable, current_liabilities,
  bonds_payable, long_term_borrowings, non_current_liabilities, total_liabilities, capital_stock,
  preferred_stock_capital, preferred_stock_liability, capital_surplus, retained_earnings, other_equity,
  treasury_stock, equity_attributable_to_parent, non_controlling_interest, total_equity, total_liabilities_and_equity`;

export const getQuarterlyBalanceSheet = async (key: QuarterlyKey): Promise<QuarterlyBalanceSheetRow | null> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawBalanceSheetRow[]>(
    `SELECT ${BALANCE_SHEET_COLUMNS} FROM "export"."quarterly_balance_sheet"
     WHERE symbol = $1 AND year = $2 AND quarter = $3 AND data_type = $4 AND subsidiary_company_id = $5 LIMIT 1`,
    key.symbol,
    key.year,
    key.quarter,
    key.dataType,
    key.subsidiaryCompanyId
  );
  return rows[0] ? mapBalanceSheetRow(rows[0]) : null;
};

export const getLatestQuarterWithBalanceSheet = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."quarterly_balance_sheet"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// quarterly_cash_flow_statement
// ---------------------------------------------------------------------------

export interface QuarterlyCashFlowStatementRow {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
  reportDate: Date;
  profitBeforeTax: bigint | null;
  depreciation: bigint | null;
  amortization: bigint | null;
  adjustmentsTotal: bigint | null;
  cashGeneratedFromOperations: bigint | null;
  incomeTaxPaid: bigint | null;
  netCashFromOperatingActivities: bigint | null;
  capitalExpenditures: bigint | null;
  proceedsFromDisposalOfPpe: bigint | null;
  acquisitionOfIntangibleAssets: bigint | null;
  interestReceived: bigint | null;
  dividendsReceived: bigint | null;
  netCashFromInvestingActivities: bigint | null;
  proceedsFromBondsIssued: bigint | null;
  repaymentOfBonds: bigint | null;
  proceedsFromLongTermBorrowings: bigint | null;
  repaymentOfLongTermBorrowings: bigint | null;
  dividendsPaid: bigint | null;
  interestPaid: bigint | null;
  netCashFromFinancingActivities: bigint | null;
  exchangeRateEffect: bigint | null;
  netIncreaseInCash: bigint | null;
  cashBeginningBalance: bigint | null;
  cashEndingBalance: bigint | null;
  cashPerBalanceSheet: bigint | null;
}

interface RawCashFlowStatementRow {
  symbol: string;
  year: number;
  quarter: number;
  data_type: string;
  subsidiary_company_id: string | null;
  report_date: Date;
  profit_before_tax: bigint | null;
  depreciation: bigint | null;
  amortization: bigint | null;
  adjustments_total: bigint | null;
  cash_generated_from_operations: bigint | null;
  income_tax_paid: bigint | null;
  net_cash_from_operating_activities: bigint | null;
  capital_expenditures: bigint | null;
  proceeds_from_disposal_of_ppe: bigint | null;
  acquisition_of_intangible_assets: bigint | null;
  interest_received: bigint | null;
  dividends_received: bigint | null;
  net_cash_from_investing_activities: bigint | null;
  proceeds_from_bonds_issued: bigint | null;
  repayment_of_bonds: bigint | null;
  proceeds_from_long_term_borrowings: bigint | null;
  repayment_of_long_term_borrowings: bigint | null;
  dividends_paid: bigint | null;
  interest_paid: bigint | null;
  net_cash_from_financing_activities: bigint | null;
  exchange_rate_effect: bigint | null;
  net_increase_in_cash: bigint | null;
  cash_beginning_balance: bigint | null;
  cash_ending_balance: bigint | null;
  cash_per_balance_sheet: bigint | null;
}

const mapCashFlowStatementRow = (row: RawCashFlowStatementRow): QuarterlyCashFlowStatementRow => ({
  symbol: row.symbol,
  year: row.year,
  quarter: row.quarter,
  dataType: row.data_type,
  subsidiaryCompanyId: row.subsidiary_company_id ?? '',
  reportDate: row.report_date,
  profitBeforeTax: row.profit_before_tax,
  depreciation: row.depreciation,
  amortization: row.amortization,
  adjustmentsTotal: row.adjustments_total,
  cashGeneratedFromOperations: row.cash_generated_from_operations,
  incomeTaxPaid: row.income_tax_paid,
  netCashFromOperatingActivities: row.net_cash_from_operating_activities,
  capitalExpenditures: row.capital_expenditures,
  proceedsFromDisposalOfPpe: row.proceeds_from_disposal_of_ppe,
  acquisitionOfIntangibleAssets: row.acquisition_of_intangible_assets,
  interestReceived: row.interest_received,
  dividendsReceived: row.dividends_received,
  netCashFromInvestingActivities: row.net_cash_from_investing_activities,
  proceedsFromBondsIssued: row.proceeds_from_bonds_issued,
  repaymentOfBonds: row.repayment_of_bonds,
  proceedsFromLongTermBorrowings: row.proceeds_from_long_term_borrowings,
  repaymentOfLongTermBorrowings: row.repayment_of_long_term_borrowings,
  dividendsPaid: row.dividends_paid,
  interestPaid: row.interest_paid,
  netCashFromFinancingActivities: row.net_cash_from_financing_activities,
  exchangeRateEffect: row.exchange_rate_effect,
  netIncreaseInCash: row.net_increase_in_cash,
  cashBeginningBalance: row.cash_beginning_balance,
  cashEndingBalance: row.cash_ending_balance,
  cashPerBalanceSheet: row.cash_per_balance_sheet,
});

const CASH_FLOW_COLUMNS = `symbol, year, quarter, data_type, subsidiary_company_id, report_date, profit_before_tax,
  depreciation, amortization, adjustments_total, cash_generated_from_operations, income_tax_paid,
  net_cash_from_operating_activities, capital_expenditures, proceeds_from_disposal_of_ppe,
  acquisition_of_intangible_assets, interest_received, dividends_received, net_cash_from_investing_activities,
  proceeds_from_bonds_issued, repayment_of_bonds, proceeds_from_long_term_borrowings,
  repayment_of_long_term_borrowings, dividends_paid, interest_paid, net_cash_from_financing_activities,
  exchange_rate_effect, net_increase_in_cash, cash_beginning_balance, cash_ending_balance, cash_per_balance_sheet`;

export const getQuarterlyCashFlowStatement = async (key: QuarterlyKey): Promise<QuarterlyCashFlowStatementRow | null> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawCashFlowStatementRow[]>(
    `SELECT ${CASH_FLOW_COLUMNS} FROM "export"."quarterly_cash_flow_statement"
     WHERE symbol = $1 AND year = $2 AND quarter = $3 AND data_type = $4 AND subsidiary_company_id = $5 LIMIT 1`,
    key.symbol,
    key.year,
    key.quarter,
    key.dataType,
    key.subsidiaryCompanyId
  );
  return rows[0] ? mapCashFlowStatementRow(rows[0]) : null;
};

export const getLatestQuarterWithCashFlowStatement = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."quarterly_cash_flow_statement"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};
