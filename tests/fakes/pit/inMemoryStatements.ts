import type {
  BalanceSheetFields,
  BankAssetQualityFields,
  BankCapitalAdequacyFields,
  BankIncomeStatementFields,
  CashFlowFields,
  FinancialStatementsPort,
  IncomeStatementFields,
  InsuranceIncomeStatementFields,
} from '@/application/ports/financialStatements';
import type { QuarterResolverPort, StatementSource } from '@/application/ports/quarterResolver';
import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';

// 財報 port 的記憶體版（FinancialStatementsPort & QuarterResolverPort 一起實作，因為「最新一季」
// 本來就該跟「有哪幾季的哪幾張表」同一份資料推得出來）。seed 用 `{ [symbol]: { '115Q2': { income?,
// balance?, cashFlow?, insurance?, bankAssetQuality?, bankCapitalAdequacy?, bankIncome? } } }` 描述，
// 沒給的欄位一律 null（跟 XBRL 缺科目時 repository 回傳 null 一致），reportDate 沒給就用該季的期末日。
// dataType/subsidiaryCompanyId 刻意不納入 seed 的鍵——單元測試只需要區分 symbol 跟季度，真實資料的
// 合併/個體維度由整合測試涵蓋。

export interface QuarterStatementSeed {
  income?: Partial<IncomeStatementFields>;
  balance?: Partial<BalanceSheetFields>;
  cashFlow?: Partial<CashFlowFields>;
  insurance?: Partial<InsuranceIncomeStatementFields> & Pick<InsuranceIncomeStatementFields, 'insuranceRevenue'>;
  bankAssetQuality?: Partial<BankAssetQualityFields>;
  bankCapitalAdequacy?: Partial<BankCapitalAdequacyFields>;
  bankIncome?: Partial<BankIncomeStatementFields>;
}

export type StatementsSeed = Record<string, Record<string, QuarterStatementSeed>>;

// 民國年 + 季 → 該季期末日（UTC），跟 XBRL 寬表 report_date 的慣例一致。
export const quarterEndDate = (rocYear: number, quarter: number): Date => {
  const monthEnd: Record<number, string> = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
  return new Date(`${rocYear + 1911}-${monthEnd[quarter]}T00:00:00.000Z`);
};

const quarterKey = (year: number, quarter: number): string => `${year}Q${quarter}`;

const parseQuarterKey = (key: string): { year: number; quarter: number } => {
  const [year, quarter] = key.split('Q');
  return { year: Number(year), quarter: Number(quarter) };
};

const emptyIncome = (reportDate: Date): IncomeStatementFields => ({
  reportDate,
  operatingRevenue: null,
  grossProfit: null,
  operatingIncome: null,
  profitBeforeTax: null,
  netIncome: null,
  adminExpenses: null,
  financeCosts: null,
  incomeTaxExpense: null,
  netIncomeAttributableToParent: null,
  operatingCost: null,
  sellingExpenses: null,
  operatingExpense: null,
  researchAndDevelopmentExpense: null,
  interestIncome: null,
  otherIncome: null,
  otherGainsLosses: null,
  equityMethodIncome: null,
  netOtherIncomeExpenses: null,
  expectedCreditLoss: null,
});

const emptyBalance = (reportDate: Date): BalanceSheetFields => ({
  reportDate,
  totalAssets: null,
  totalLiabilities: null,
  currentAssets: null,
  currentLiabilities: null,
  inventory: null,
  longTermBorrowings: null,
  propertyPlantEquipment: null,
  retainedEarnings: null,
  cashAndEquivalents: null,
  equityAttributableToParent: null,
  totalEquity: null,
  accountsPayable: null,
  accountsReceivable: null,
  bondsPayable: null,
  shortTermBorrowings: null,
  preferredStockCapital: null,
});

const emptyCashFlow = (reportDate: Date): CashFlowFields => ({
  reportDate,
  netCashFromOperatingActivities: null,
  capitalExpenditures: null,
  depreciation: null,
  amortization: null,
  dividendsPaid: null,
  netCashFromInvestingActivities: null,
});

const emptyBankAssetQuality = (reportDate: Date): BankAssetQualityFields => ({ reportDate, nonPerformingLoansRatio: null, coverageRatio: null });

const emptyBankCapitalAdequacy = (reportDate: Date): BankCapitalAdequacyFields => ({
  reportDate,
  eligibleCapital: null,
  riskWeightedAssets: null,
  ratioOrdinaryShareEquityToRwa: null,
  ratioTierICapitalToRwa: null,
});

const emptyBankIncome = (reportDate: Date): BankIncomeStatementFields => ({
  reportDate,
  netInterestIncome: null,
  netNonInterestIncome: null,
  badDebtProvision: null,
  profitBeforeTax: null,
});

const sourceOf: Record<StatementSource, keyof QuarterStatementSeed> = {
  balanceSheet: 'balance',
  incomeStatement: 'income',
  cashFlowStatement: 'cashFlow',
  insuranceIncomeStatement: 'insurance',
  bankAssetQuality: 'bankAssetQuality',
  bankCapitalAdequacy: 'bankCapitalAdequacy',
  bankIncomeStatement: 'bankIncome',
};

export const createInMemoryStatements = (seed: StatementsSeed): FinancialStatementsPort & QuarterResolverPort => {
  const lookup = (key: QuarterlyKey): QuarterStatementSeed | undefined => seed[key.symbol]?.[quarterKey(key.year, key.quarter)];

  // 有 seed 該張表才回傳（缺欄位補 null、reportDate 補期末日），沒 seed 就是 null。
  const statement = <T extends { reportDate: Date }>(key: QuarterlyKey, partial: Partial<T> | undefined, empty: (reportDate: Date) => T): T | null =>
    partial ? { ...empty(quarterEndDate(key.year, key.quarter)), ...partial } : null;

  return {
    getIncomeStatement: async (key) => statement(key, lookup(key)?.income, emptyIncome),
    getBalanceSheet: async (key) => statement(key, lookup(key)?.balance, emptyBalance),
    getCashFlowStatement: async (key) => statement(key, lookup(key)?.cashFlow, emptyCashFlow),
    getInsuranceIncomeStatement: async (key) => {
      const insurance = lookup(key)?.insurance;
      if (!insurance) return null;
      return { reportDate: quarterEndDate(key.year, key.quarter), insuranceServiceResult: null, netOperatingIncomeLoss: null, ...insurance };
    },
    getBankAssetQuality: async (key) => statement(key, lookup(key)?.bankAssetQuality, emptyBankAssetQuality),
    getBankCapitalAdequacy: async (key) => statement(key, lookup(key)?.bankCapitalAdequacy, emptyBankCapitalAdequacy),
    getBankIncomeStatement: async (key) => statement(key, lookup(key)?.bankIncome, emptyBankIncome),
    // 該張表有資料的最大 (year, quarter)，任何一季都沒有這張表就 null——跟 XBRL 寬表的
    // `ORDER BY year DESC, quarter DESC LIMIT 1` 同義。
    latestQuarterWith: async (source, symbol) => {
      const quarters = Object.entries(seed[symbol] ?? {})
        .filter(([, statements]) => statements[sourceOf[source]] !== undefined)
        .map(([key]) => parseQuarterKey(key))
        .sort((a, b) => b.year * 4 + b.quarter - (a.year * 4 + a.quarter));
      return quarters[0] ?? null;
    },
  };
};
