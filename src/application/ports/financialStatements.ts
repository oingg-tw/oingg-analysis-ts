import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';

// 2026-09-17 clean architecture 重構 Phase 3：指標核心的財報查詢 port。介面跟它回傳的 DTO 型別
// 一起住在 application——依賴方向是 infrastructure 實作這裡宣告的介面，application 不知道
// XBRL 寬表/Prisma 的存在。四個單方法介面沿用 2026-09-13 DIP 鋪開時的 ISP 切法（一支指標只
// 依賴它真的用到的那幾張表，用交集型別組合），FinancialStatementsPort 是四者的交集，給
// PitDeps.statements 用。
//
// 欄位型別是從 infrastructure/repositories/mops/*XbrlFirst.ts 原封搬來的（那邊 re-export 給
// 既有 import 路徑），每個欄位對應哪個 XBRL account_code、用哪幾家公司交叉驗證過，紀錄仍在
// 各 repository 檔頭，這裡只描述形狀。金額單位一律千元、bigint。

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

export interface BalanceSheetFields {
  reportDate: Date;
  totalAssets: bigint | null;
  totalLiabilities: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  inventory: bigint | null;
  longTermBorrowings: bigint | null;
  propertyPlantEquipment: bigint | null;
  retainedEarnings: bigint | null;
  cashAndEquivalents: bigint | null;
  equityAttributableToParent: bigint | null;
  totalEquity: bigint | null;
  accountsPayable: bigint | null;
  accountsReceivable: bigint | null;
  bondsPayable: bigint | null;
  shortTermBorrowings: bigint | null;
  preferredStockCapital: bigint | null;
}

export interface CashFlowFields {
  reportDate: Date;
  netCashFromOperatingActivities: bigint | null;
  capitalExpenditures: bigint | null;
  depreciation: bigint | null;
  amortization: bigint | null;
  dividendsPaid: bigint | null;
  netCashFromInvestingActivities: bigint | null;
}

// insuranceRevenue 非 null 才代表「這家公司這一季適用保險業科目」，repository 保證有值才回傳物件。
export interface InsuranceIncomeStatementFields {
  reportDate: Date;
  insuranceRevenue: bigint;
  insuranceServiceResult: bigint | null;
  netOperatingIncomeLoss: bigint | null;
}

export interface IncomeStatementPort {
  getIncomeStatement(key: QuarterlyKey): Promise<IncomeStatementFields | null>;
}

export interface BalanceSheetPort {
  getBalanceSheet(key: QuarterlyKey): Promise<BalanceSheetFields | null>;
}

export interface CashFlowStatementPort {
  getCashFlowStatement(key: QuarterlyKey): Promise<CashFlowFields | null>;
}

export interface InsuranceIncomeStatementPort {
  getInsuranceIncomeStatement(key: QuarterlyKey): Promise<InsuranceIncomeStatementFields | null>;
}

export type FinancialStatementsPort = IncomeStatementPort & BalanceSheetPort & CashFlowStatementPort & InsuranceIncomeStatementPort;
