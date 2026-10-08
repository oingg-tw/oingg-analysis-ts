import type { PitDeps } from '@/application/metrics/deps';
import type { AnnualIncomeStatement } from '@/application/ports/annualReport';
import type { BankIncomeStatementFields, IncomeStatementFields } from '@/application/ports/financialStatements';
import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';
import type { Season } from '@/domain/calendar/rocQuarter';
import { bankIncomeAsGeneral } from '@/domain/financials/bankIncome';
import { resolveTrailingIncomeStatements, type TrailingYear } from './trailingYear';

// 2026-10-08 銀行業的營收／毛利／營業利益（公式與出處見 domain/financials/bankIncome.ts）。一般損益表查得到列、營收是 null、
// 銀行損益表明細查得到（只有純銀行；13 家金控在明細表一律 null，見 bankIncomeStatementXbrl.ts）→ 用銀行公式補上
// operatingRevenue／grossProfit／operatingIncome，並標 revenueSource: 'bank'、附上銀行原始科目給溯源表拆解。
// **只給使用者選定的 7 支用**（每股營收、PSR、營收成長率、營收 CAGR、毛利率、營業利益率、淨利率）：其餘讀營收的指標
// （Piotroski、Novy-Marx、週轉率、資本支出／營收…）是為一般產業設計的模型，刻意不經過這裡，銀行照舊標不適用。
// compute 與溯源都走這裡，溯源表才會跟儲存值對得上。
export type RevenueSource = 'general' | 'bank';
export type BankAware<T extends IncomeStatementFields> = T & { revenueSource: RevenueSource; bank: BankIncomeStatementFields | null };

type Deps = Pick<PitDeps, 'statements'>;

const asGeneral = <T extends IncomeStatementFields>(record: T): BankAware<T> => ({ ...record, revenueSource: 'general', bank: null });

export const withBankIncome = async <T extends IncomeStatementFields>(record: T | null, key: QuarterlyKey, deps: Deps): Promise<BankAware<T> | null> => {
  if (!record) return null;
  if (record.operatingRevenue !== null) return asGeneral(record);
  const bank = await deps.statements.getBankIncomeStatement(key);
  const derived = bank
    ? bankIncomeAsGeneral({
        interestIncome: record.interestIncome,
        netInterestIncome: bank.netInterestIncome,
        netNonInterestIncome: bank.netNonInterestIncome,
        badDebtProvision: bank.badDebtProvision,
        profitBeforeTax: record.profitBeforeTax ?? bank.profitBeforeTax,
        fvociRealizedGain: bank.fvociRealizedGain,
        amortisedCostDerecognitionGain: bank.amortisedCostDerecognitionGain,
      })
    : null;
  if (!derived) return asGeneral(record);
  return { ...record, operatingRevenue: derived.revenue, grossProfit: derived.grossProfit, operatingIncome: derived.operatingIncome, revenueSource: 'bank', bank };
};

// 近一年：單季段逐季補；興櫃半年段（累計數推出來的）不補——銀行明細只有單季列，比照保險 fallback（margins 的 insuranceKey: null）。
// toBankAwareTrailing 給已經查好近一年的呼叫端（杜邦）直接轉，不重查一次。
export const toBankAwareTrailing = async (
  trailing: TrailingYear<IncomeStatementFields>,
  key: { symbol: string; dataType: string; subsidiaryCompanyId: string },
  deps: Deps
): Promise<TrailingYear<BankAware<IncomeStatementFields>>> => {
  const periods = await Promise.all(
    trailing.periods.map(async (p) => ({
      ...p,
      record: p.half
        ? p.record && asGeneral(p.record)
        : await withBankIncome(p.record, { symbol: key.symbol, year: Number(p.year), quarter: Number(p.season), dataType: key.dataType, subsidiaryCompanyId: key.subsidiaryCompanyId }, deps),
    }))
  );
  return { basis: trailing.basis, periods };
};

export const resolveTrailingBankAwareIncome = async (
  key: { symbol: string; rocYear: number; season: Season; dataType: string; subsidiaryCompanyId: string },
  deps: Pick<PitDeps, 'statements' | 'cumulativeStatements'>
): Promise<TrailingYear<BankAware<IncomeStatementFields>>> => toBankAwareTrailing(await resolveTrailingIncomeStatements(key, deps), key, deps);

// 年報：銀行的年報營收同樣是 null，用同一年四個單季的銀行公式加總補上（第四季是單季，見 UBIQUITOUS_LANGUAGE.md〈三、期間口徑〉）；
// 四季不齊或任一季不是銀行口徑就不補，維持 null。淨利、EPS 等其他欄位照用年報本身。
export const withBankAnnualIncome = async (
  annual: AnnualIncomeStatement | null,
  key: { symbol: string; rocYear: number; dataType: string; subsidiaryCompanyId: string },
  deps: Deps
): Promise<BankAware<AnnualIncomeStatement> | null> => {
  if (!annual) return null;
  if (annual.operatingRevenue !== null) return asGeneral(annual);
  const quarters = await Promise.all(
    [1, 2, 3, 4].map(async (quarter) => {
      const quarterKey = { symbol: key.symbol, year: key.rocYear, quarter, dataType: key.dataType, subsidiaryCompanyId: key.subsidiaryCompanyId };
      return withBankIncome(await deps.statements.getIncomeStatement(quarterKey), quarterKey, deps);
    })
  );
  if (quarters.some((q) => q?.revenueSource !== 'bank')) return asGeneral(annual);
  const sum = (pick: (q: BankAware<IncomeStatementFields>) => bigint | null): bigint | null =>
    quarters.some((q) => pick(q!) === null) ? null : quarters.reduce((total, q) => total + pick(q!)!, 0n);
  return { ...annual, operatingRevenue: sum((q) => q.operatingRevenue), grossProfit: sum((q) => q.grossProfit), operatingIncome: sum((q) => q.operatingIncome), revenueSource: 'bank', bank: null };
};
