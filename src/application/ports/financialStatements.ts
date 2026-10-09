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
  operatingExpense: bigint | null;
  netIncomeAttributableToParent: bigint | null;
  operatingCost: bigint | null;
  sellingExpenses: bigint | null;
  // 2026-09-24「營收→股利」瀑布圖補完缺口新增。全部來自 quarterly_income_statement_xbrl 同一列，
  // 跟上面那些欄位同一次查詢帶回來，不多打一次 DB。
  researchAndDevelopmentExpense: bigint | null;
  interestIncome: bigint | null;          // revenue_from_interest：業外的利息收入
  otherIncome: bigint | null;             // other_revenue：業外的其他收入
  otherGainsLosses: bigint | null;        // other_gains_losses：業外的其他利益及損失
  equityMethodIncome: bigint | null;      // 採用權益法認列之關聯企業及合資損益份額
  netOtherIncomeExpenses: bigint | null;  // net_other_income_expenses：其他收益及費損淨額（營業利益的調整項）
  expectedCreditLoss: bigint | null;      // impairment_loss_gain_reversal_ifrs9：IFRS 9 預期信用減損損失，營業費用的第四個組成
}

export interface BalanceSheetFields {
  reportDate: Date;
  totalAssets: bigint | null;
  totalLiabilities: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  noncurrentLiabilities: bigint | null; // 2026-10-09 非流動負債合計（noncurrent_liabilities；負債比率拆流動／非流動用）
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
  // 2026-09-28 有息負債補齊（使用者拍板）：之前共用的有息負債只有短期借款＋非流動公司債＋長期借款，漏了下面兩項。
  shortTermNotesAndBillsPayable: bigint | null; // current_cp_issued_and_portion：應付短期票券（商業本票，折價後帳面淨額），115Q2 378 家
  currentPortionOfLongTermLiabilities: bigint | null; // longterm_liabilities_current_portion，缺時退回一年內到期公司債＋一年內到期長期借款
  // S&P 調整後負債（netDebtToEbitda 專用）額外加回的兩項。
  currentLeaseLiabilities: bigint | null; // current_lease_liabilities
  noncurrentLeaseLiabilities: bigint | null; // noncurrent_lease_liabilities
  netDefinedBenefitLiability: bigint | null; // noncurrent_liabilities_defined_benefit：淨確定福利負債（退休金提撥不足）
}

export interface CashFlowFields {
  reportDate: Date;
  netCashFromOperatingActivities: bigint | null;
  capitalExpenditures: bigint | null;
  depreciation: bigint | null;
  amortization: bigint | null;
  dividendsPaid: bigint | null;
  // 2026-09-28 這一期的股利實際來自哪個 XBRL 科目（provenance 連結原始財報那一列用）：逐期判斷，同一家公司可能換科目（1410 115Q2 營業、之前籌資）；
  // 兩個都沒有是 null（不要填假的鍵，前端 null 就不畫跳轉按鈕）。
  dividendsPaidFieldKey: 'dividends_paid_financing' | 'dividends_paid_operating' | null;
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

// ---- 銀行監理揭露（bank_asset_quality_xbrl / bank_capital_adequacy_detail_xbrl / bank_income_statement_detail_xbrl）----
// 對指標核心來說就是「另外三張按季的表」，跟一般三大表同一種 QuarterlyKey 查詢形狀，所以放同一個 port 家族。
// 比率欄位是 number（Postgres numeric 在 repository 內統一 Number() 轉換），金額仍是 bigint 千元。

export interface BankAssetQualityFields {
  reportDate: Date;
  nonPerformingLoansRatio: number | null;
  coverageRatio: number | null;
}

export interface BankCapitalAdequacyFields {
  reportDate: Date;
  eligibleCapital: bigint | null;
  riskWeightedAssets: bigint | null;
  ratioOrdinaryShareEquityToRwa: number | null;
  ratioTierICapitalToRwa: number | null;
}

export interface BankIncomeStatementFields {
  reportDate: Date;
  netInterestIncome: bigint | null; // 利息淨收益（net_income_loss_of_interest，已經是利息收入減利息費用後的淨額）
  netNonInterestIncome: bigint | null; // 非利息淨收益（net_non_interest_income_loss，含手續費/投資/匯兌等全部非利息項目淨額）
  badDebtProvision: bigint | null; // 呆帳費用及保證責任準備（官方單一總計欄位，不拆子項）
  profitBeforeTax: bigint | null; // 稅前淨利，跟一般三大表（xbrl_three_statements_long）的 profit_loss_before_tax 是同一份文件的同一個數字，可交叉驗證
  // 2026-10-09 銀行口徑營業利益要扣的兩項（處分收息用債券投資的已實現損益，見 domain/financials/bankIncome.ts）：
  fvociRealizedGain: bigint | null; // 透過其他綜合損益按公允價值衡量之金融資產已實現損益（tifrs-bsci-basi:RealizedGainLossOnFinancialAssetsAtFairValueThroughOtherComprehensiveIncome）
  amortisedCostDerecognitionGain: bigint | null; // 除列按攤銷後成本衡量之金融資產損益（ifrs-full:GainLossArisingFromDerecognitionOfFinancialAssetsMeasuredAtAmortisedCost）
}

// 2026-09-28 銀行／金控營業費用三分拆（使用者：「做」）：營業費用 = 員工福利 + 折舊及攤銷 + 其他業務及管理費用
// （taxonomy 就這 3 個子科目，mops-ts 實測 115Q2 20 家逐家差額 0；單季與累計各自閉合）。一般業、保險、券商沒有這組科目。
// 第三項銀行與金控在兩張不同的表、欄位名不同，repository 內 coalesce——只接銀行表會讓 13 家金控缺第三塊（現象像資料不全而非接錯表）。
export interface BankOperatingExpenseFields {
  reportDate: Date;
  employeeBenefits: bigint | null; // 員工福利費用（單季）
  depreciationAmortisation: bigint | null; // 折舊及攤銷費用（單季）
  otherGeneralAdministrative: bigint | null; // 其他業務及管理費用（單季；銀行表或金控表）
}

export interface BankOperatingExpensePort {
  getBankOperatingExpense(key: QuarterlyKey): Promise<BankOperatingExpenseFields | null>;
}

export interface BankAssetQualityPort {
  getBankAssetQuality(key: QuarterlyKey): Promise<BankAssetQualityFields | null>;
}

export interface BankCapitalAdequacyPort {
  getBankCapitalAdequacy(key: QuarterlyKey): Promise<BankCapitalAdequacyFields | null>;
}

export interface BankIncomeStatementPort {
  getBankIncomeStatement(key: QuarterlyKey): Promise<BankIncomeStatementFields | null>;
}

export type FinancialStatementsPort = IncomeStatementPort &
  BankOperatingExpensePort &
  BalanceSheetPort &
  CashFlowStatementPort &
  InsuranceIncomeStatementPort &
  BankAssetQualityPort &
  BankCapitalAdequacyPort &
  BankIncomeStatementPort;
