import { expect, test } from 'vitest';
import { getBankCapitalAdequacyProvenance } from '@/application/metrics/resilience/bankCapitalAdequacy/getBankCapitalAdequacyProvenance';
import { getBankIncomeWaterfallProvenance } from '@/application/metrics/profitability/bankIncomeWaterfall/getBankIncomeWaterfallProvenance';
import { getBankOperatingExpenseBreakdownProvenance } from '@/application/metrics/profitability/bankOperatingExpenseBreakdown/getBankOperatingExpenseBreakdownProvenance';
import { createInMemoryStatements, type StatementsSeed } from '../../../fakes/pit/inMemoryStatements';
import { createTestPitDeps } from '../../../fakes/pit/createTestPitDeps';

// 2026-10-01 銀行三個家族的溯源表：value 走 compute 同一支 resolver，這裡守住「近四季逐季列出、殘差法、擋門」三件事。
const depsFor = (seed: StatementsSeed) => {
  const statements = createInMemoryStatements(seed);
  return createTestPitDeps({
    statements,
    quarters: statements,
    industry: { isFinancialIndustryCompany: async () => true } as never,
    shares: { getOutstandingCommonShares: async () => ({ outstandingCommonShares: 1_000_000n }) } as never,
  });
};
const query = { symbol: '2801', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' } as const;
const bankIncome = (i: bigint, n: bigint, b: bigint, p: bigint) => ({ bankIncome: { netInterestIncome: i, netNonInterestIncome: n, badDebtProvision: b, profitBeforeTax: p } });

test('瀑布圖其他營業費用（TTM）= 近四季（利息淨收益 + 非利息淨收益 − 呆帳 − 稅前）× 1000 ÷ 股數，四季四科目逐筆列出', async () => {
  const deps = depsFor({ '2801': { '114Q3': bankIncome(10000n, 5000n, 1000n, 4000n), '114Q4': bankIncome(10000n, 5000n, 1000n, 4000n), '115Q1': bankIncome(10000n, 5000n, 1000n, 4000n), '115Q2': bankIncome(10000n, 5000n, 1000n, 4000n) } });
  const result = await getBankIncomeWaterfallProvenance('bankOtherOperatingExpensePerShare', deps)(query);
  expect(result.value).toBe(40); // 每季 10,000 千元 × 4 季 × 1000 ÷ 1,000,000 股
  expect(result.entries).toHaveLength(1 + 4 * 4);
  expect(result.entries[1]!.role).toBe('近四季 利息淨收益（114 年第 3 季）');
});

test('營業費用三分拆（TTM）缺一季 → value null 但仍 found，逐季列出缺的那季為 null', async () => {
  const opex = (e: bigint) => ({ bankOperatingExpense: { employeeBenefits: e, depreciationAmortisation: 1n, otherGeneralAdministrative: 1n } });
  const deps = depsFor({ '2801': { '114Q4': opex(1n), '115Q1': opex(1n), '115Q2': opex(1n) } });
  const result = await getBankOperatingExpenseBreakdownProvenance('bankEmployeeBenefitsExpensePerShare', deps)(query);
  expect(result.found).toBe(true);
  expect(result.value).toBeNull();
  expect(result.entries.map((e) => e.value)).toEqual(['1000000', null, '1', '1', '1']);
});

test('資本適足率 = 合格資本 ÷ 風險性資產；非金融業 found=false', async () => {
  const deps = depsFor({ '2801': { '115Q2': { bankCapitalAdequacy: { eligibleCapital: 150n, riskWeightedAssets: 1000n } } } });
  const result = await getBankCapitalAdequacyProvenance('bankCarRatio', deps)(query);
  expect(result.value).toBe(15);
  expect(result.entries.map((e) => e.value)).toEqual(['150', '1000']);

  const nonBank = await getBankCapitalAdequacyProvenance('bankCarRatio', { ...deps, industry: { isFinancialIndustryCompany: async () => false } as never })(query);
  expect(nonBank.found).toBe(false);
});
