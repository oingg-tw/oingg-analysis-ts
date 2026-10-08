import { expect, test } from 'vitest';
import { computeMarginsFamily } from '@/application/metrics/profitability/margins/computeMarginsFamily';
import { computeDupontFamily } from '@/application/metrics/shared/dupont/computeDupontFamily';
import { computeRevenuePerShare } from '@/application/metrics/profitability/revenuePerShare/computeRevenuePerShare';
import { getGrossMarginProvenance } from '@/application/metrics/profitability/grossMargin/getGrossMarginProvenance';
import { getNetProfitMarginProvenance } from '@/application/metrics/profitability/netProfitMargin/getNetProfitMarginProvenance';
import { createInMemoryStatements, type QuarterStatementSeed, type StatementsSeed } from '../../../fakes/pit/inMemoryStatements';
import { createTestPitDeps } from '../../../fakes/pit/createTestPitDeps';
import { createFixedAnnouncements } from '../../../fakes/pit/fixedAnnouncements';

// 2026-10-08 銀行口徑（domain/financials/bankIncome.ts）接到毛利率家族、杜邦淨利率、每股營收：四季都放 2838 聯邦銀 115Q2 單季
// 的真實數字（千元），TTM 比率就等於單季比率，可以直接對券商軟體的 55.28%／20.72%。守住：數字對、溯源跟 compute 一致、
// 總資產週轉率沒被帶進銀行營收、金控（銀行明細查無）照舊是 null。
const bankQuarter: QuarterStatementSeed = {
  income: { interestIncome: 6193510n, profitBeforeTax: 2427328n, netIncome: 2107119n, netIncomeAttributableToParent: 2110316n },
  bankIncome: { netInterestIncome: 2681816n, netNonInterestIncome: 3977763n, badDebtProvision: 1036765n, profitBeforeTax: 2427328n },
  balance: { totalAssets: 1_000_000_000n, totalEquity: 80_000_000n },
};
const fourQuarters = (q: QuarterStatementSeed) => ({ '114Q3': q, '114Q4': q, '115Q1': q, '115Q2': q });

const depsFor = (seed: StatementsSeed) => {
  const statements = createInMemoryStatements(seed);
  return createTestPitDeps({
    statements,
    quarters: statements,
    announcements: createFixedAnnouncements(),
    industry: { isFinancialIndustryCompany: async () => true } as never,
    annualReports: { getAnnualIncomeStatement: async () => null },
    shares: { getOutstandingCommonShares: async () => ({ outstandingCommonShares: 1_000_000n }) } as never,
  });
};
const query = { symbol: '2838', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' } as const;
const valueOf = (slot: unknown) => (slot as { value: number | null }).value;
const reasonOf = (slot: unknown) => (slot as { nullReason: string | null }).nullReason;

test('毛利率／營業利益率（Q、TTM）用銀行口徑，對得上券商軟體', async () => {
  const { slots } = await computeMarginsFamily(query, depsFor({ '2838': fourQuarters(bankQuarter) }));
  expect(valueOf(slots.grossMarginQ)).toBe(55.28);
  expect(valueOf(slots.grossMarginTtm)).toBe(55.28);
  expect(valueOf(slots.operatingMarginQ)).toBe(23.86);
  expect(valueOf(slots.operatingMarginTtm)).toBe(23.86);
});

test('杜邦：淨利率用銀行口徑營收，總資產週轉率不受影響（仍 null）', async () => {
  const { slots } = await computeDupontFamily(query, depsFor({ '2838': fourQuarters(bankQuarter) }));
  // Q/TTM 淨利率照既有慣例用歸屬母公司淨利（2,110,316 → 20.75%）；券商軟體的 20.72% 是合併淨利（2,107,119），FY 才用合併口徑。
  expect(valueOf(slots.netProfitMarginQ)).toBe(20.75);
  expect(valueOf(slots.netProfitMarginTtm)).toBe(20.75);
  expect(valueOf(slots.assetTurnoverQ)).toBeNull();
  expect(valueOf(slots.assetTurnoverTtm)).toBeNull();
});

test('每股營收 TTM = 近四季銀行口徑營收 × 1000 ÷ 股數', async () => {
  const { slots } = await computeRevenuePerShare(query, depsFor({ '2838': fourQuarters(bankQuarter) }));
  expect(valueOf(slots.ttm)).toBe(40685.09); // 10,171,273 千元 × 4 × 1000 ÷ 1,000,000 股
});

test('溯源表的值跟 compute 一致，並逐項列出銀行口徑的構成', async () => {
  const deps = depsFor({ '2838': fourQuarters(bankQuarter) });
  const gross = await getGrossMarginProvenance(query, deps);
  expect(gross.value).toBe(55.28);
  expect(gross.entries).toHaveLength(4 * 5); // 每季：利息收入總額、非利息淨收益（營收）＋利息淨收益、非利息淨收益、呆帳（毛利）
  expect(gross.entries[0]!.fieldKey).toBe('revenue_from_interest');
  expect(gross.methodologyNote).toContain('利息收入總額');
  const npm = await getNetProfitMarginProvenance(query, deps);
  expect(npm.value).toBe(20.75);
});

test('金控（銀行明細查無）：照舊 null、標不適用', async () => {
  const holding: QuarterStatementSeed = { income: bankQuarter.income, balance: bankQuarter.balance };
  const { slots } = await computeMarginsFamily({ ...query, symbol: '2880' }, depsFor({ '2880': fourQuarters(holding) }));
  expect(valueOf(slots.grossMarginQ)).toBeNull();
  expect(reasonOf(slots.grossMarginQ)).toBe('not_applicable_industry');
});
