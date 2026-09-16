import type {
  BalanceSheetFields,
  CashFlowFields,
  FinancialStatementsPort,
  IncomeStatementFields,
  InsuranceIncomeStatementFields,
} from '@/application/ports/financialStatements';
import type { QuarterResolverPort, StatementSource } from '@/application/ports/quarterResolver';
import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';

// 財報 port 的記憶體版（FinancialStatementsPort & QuarterResolverPort 一起實作，因為「最新一季」
// 本來就該跟「有哪幾季的哪幾張表」同一份資料推得出來）。seed 用 `{ [symbol]: { '115Q2': { income?,
// balance?, cashFlow?, insurance? } } }` 描述，沒給的欄位一律 null（跟 XBRL 缺科目時 repository 回傳
// null 一致），reportDate 沒給就用該季的期末日。dataType/subsidiaryCompanyId 刻意不納入 seed 的鍵
// ——單元測試只需要區分 symbol 跟季度，真實資料的合併/個體維度由整合測試涵蓋。

export interface QuarterStatementSeed {
  income?: Partial<IncomeStatementFields>;
  balance?: Partial<BalanceSheetFields>;
  cashFlow?: Partial<CashFlowFields>;
  insurance?: Partial<InsuranceIncomeStatementFields> & Pick<InsuranceIncomeStatementFields, 'insuranceRevenue'>;
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

const sourceOf: Record<StatementSource, keyof QuarterStatementSeed> = {
  balanceSheet: 'balance',
  incomeStatement: 'income',
  cashFlowStatement: 'cashFlow',
};

export const createInMemoryStatements = (seed: StatementsSeed): FinancialStatementsPort & QuarterResolverPort => {
  const lookup = (key: QuarterlyKey): QuarterStatementSeed | undefined => seed[key.symbol]?.[quarterKey(key.year, key.quarter)];

  return {
    getIncomeStatement: async (key) => {
      const income = lookup(key)?.income;
      return income ? { ...emptyIncome(quarterEndDate(key.year, key.quarter)), ...income } : null;
    },
    getBalanceSheet: async (key) => {
      const balance = lookup(key)?.balance;
      return balance ? { ...emptyBalance(quarterEndDate(key.year, key.quarter)), ...balance } : null;
    },
    getCashFlowStatement: async (key) => {
      const cashFlow = lookup(key)?.cashFlow;
      return cashFlow ? { ...emptyCashFlow(quarterEndDate(key.year, key.quarter)), ...cashFlow } : null;
    },
    getInsuranceIncomeStatement: async (key) => {
      const insurance = lookup(key)?.insurance;
      if (!insurance) return null;
      return {
        reportDate: quarterEndDate(key.year, key.quarter),
        insuranceServiceResult: null,
        netOperatingIncomeLoss: null,
        ...insurance,
      };
    },
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
