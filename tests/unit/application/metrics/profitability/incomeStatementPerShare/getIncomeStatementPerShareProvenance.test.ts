import { expect, test } from 'vitest';
import { FIELDS, computeIncomeStatementPerShare } from '@/application/metrics/profitability/incomeStatementPerShare/computeIncomeStatementPerShare';
import { getIncomeStatementPerShareProvenance } from '@/application/metrics/profitability/incomeStatementPerShare/getIncomeStatementPerShareProvenance';
import { createInMemoryStatements } from '../../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-10-01 瀑布圖每股家族 17 支共用一支溯源 resolver。釘住兩件事：
// 1. 溯源表的 value 跟 compute 寫進 metric_values 的 TTM 值逐支相等（溯源表最怕「看起來合理但跟徽章上的數字不同」）；
// 2. 營業費用分拆缺行當 0 的那一期，entry 照實列 0 並標註，而不是顯示缺值卻算出數字。
const quarter = (sellingExpenses: bigint | null) => ({
  income: {
    grossProfit: 500n, operatingIncome: 200n, profitBeforeTax: 260n, netIncome: 210n, netIncomeAttributableToParent: 200n,
    operatingCost: 1000n, operatingExpense: 300n, sellingExpenses, adminExpenses: 300n - (sellingExpenses ?? 0n), researchAndDevelopmentExpense: 0n, expectedCreditLoss: 0n,
    incomeTaxExpense: 50n, financeCosts: 10n, interestIncome: 20n, otherIncome: 30n, otherGainsLosses: 15n, equityMethodIncome: 5n, netOtherIncomeExpenses: 0n,
  },
});
const statements = createInMemoryStatements({ '9001': { '114Q3': quarter(100n), '114Q4': quarter(null), '115Q1': quarter(100n), '115Q2': quarter(100n) } });
const deps = createTestPitDeps({
  statements,
  quarters: statements,
  announcements: createFixedAnnouncements(),
  annualReports: { getAnnualIncomeStatement: async () => null },
  shares: { getOutstandingCommonShares: async () => ({ outstandingCommonShares: 1_000_000n }) } as never,
});
const query = { symbol: '9001', year: '115', season: '2' as const, dataType: '2' as const, subsidiaryCompanyId: '' };

test('17 支的溯源 value 都等於 compute 的 TTM 值', async () => {
  const batch = await computeIncomeStatementPerShare(query, deps);
  for (const field of FIELDS.filter((f) => f.periodTypes[0] === 'TTM')) {
    const provenance = await getIncomeStatementPerShareProvenance(field.metricCode, query, deps);
    expect(provenance.value, field.metricCode).toBe((batch.slots[field.slot] as { value: number | null }).value);
  }
});

test('推銷費用缺行但營業費用恆等式成立 → 那一期列 0 並標註；相減型指標每期列兩個欄位', async () => {
  const selling = await getIncomeStatementPerShareProvenance('sellingExpensePerShare', query, deps);
  expect(selling.value).toBe(0.3); // (100+0+100+100) 千元 × 1000 ÷ 1,000,000 股
  expect(selling.entries[1]).toMatchObject({ fiscalYear: 2025, fiscalQuarter: 4, fieldKey: 'selling_expense', value: '0' });
  expect(selling.entries[1]!.role).toContain('缺行當 0');

  const nonOp = await getIncomeStatementPerShareProvenance('nonOperatingIncomeExpensesPerShare', query, deps);
  expect(nonOp.entries.map((e) => e.fieldKey)).toEqual([...[...Array(4)].flatMap(() => ['profit_loss_before_tax', 'profit_loss_from_operating_activities']), null]);
  expect(nonOp.value).toBe(0.24); // (260−200)×4 千元 ÷ 1,000,000 股
});
