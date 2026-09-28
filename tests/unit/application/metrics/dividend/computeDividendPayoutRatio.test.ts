import { expect, test } from 'vitest';
import { computeDividendPayoutRatio } from '@/application/metrics/dividend/dividendPayoutRatio/computeDividendPayoutRatio';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements } from '../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../fakes/pit/createTestPitDeps';

// 2026-09-27 web-nuxt 抓到：2412 114Q3 整份現金流量表缺席（股利剛好在第三季付），近四季發放率被算成 0、nullReason 還是 null。
// 整份表缺 → 算不出來；表在、股利科目 null（本年度還沒付）才是 0。
const run = async (q3CashFlow: boolean) => {
  const statements = createInMemoryStatements({
    '2412': {
      '114Q3': { income: { netIncomeAttributableToParent: 1000n }, ...(q3CashFlow ? { cashFlow: { dividendsPaid: -800n } } : {}) },
      '114Q4': { income: { netIncomeAttributableToParent: 1000n }, cashFlow: {} },
      '115Q1': { income: { netIncomeAttributableToParent: 1000n }, cashFlow: {} },
      '115Q2': { income: { netIncomeAttributableToParent: 1000n }, cashFlow: {} },
    },
  });
  const deps = createTestPitDeps({ statements, quarters: statements, announcements: createFixedAnnouncements(), annualReports: { getAnnualIncomeStatement: async () => null } });
  const batch = await computeDividendPayoutRatio({ symbol: '2412', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' }, deps);
  if (isComputationSkip(batch.slots.ttm)) throw new Error(JSON.stringify(batch.slots.ttm));
  return batch.slots.ttm as MetricComputation;
};

test('近四季有一季整份現金流量表缺席 → null（insufficient_history），不是 0', async () => {
  const ttm = await run(false);
  expect(ttm.value).toBeNull();
  expect(ttm.nullReason).toBe('insufficient_history');
});

test('表都在、只有付款那季有股利科目 → 其他季的 null 科目視為 0（800 ÷ 4000 = 20%）', async () => {
  expect((await run(true)).value).toBe(20);
});

// 2026-09-28 FY：該盈餘所屬年度的盈餘分配現金股利 ÷ 年報基本每股盈餘，跟股利歷史的 payoutRatio 同一個算式。
test('FY：盈餘分配現金股利（逐次加總，不含公積發放）÷ 年報 EPS；尚無分派公告為 missing_input', async () => {
  const statements = createInMemoryStatements({ '2330': { '114Q4': { income: { netIncomeAttributableToParent: 1000n }, cashFlow: {} } } });
  const annual = { ...(await statements.getIncomeStatement({ symbol: '2330', year: 114, quarter: 4, dataType: '2', subsidiaryCompanyId: '' }))!, basicEps: 10 };
  const row = (cash: number, capitalSurplus: number) => ({
    rocFiscalYear: 114, fiscalQuarter: null, cashDividendFromEarnings: cash, cashDividendFromLegalReserveAndCapitalSurplus: capitalSurplus,
    stockDividendFromEarnings: null, stockDividendFromLegalReserveAndCapitalSurplus: null, exDividendDate: null, exRightsDate: null,
    cashDividendPaymentDate: null, announcementDate: new Date('2026-03-10T00:00:00Z'),
  });
  const fy = async (rows: ReturnType<typeof row>[]) => {
    const deps = createTestPitDeps({
      statements, quarters: statements, announcements: createFixedAnnouncements(),
      annualReports: { getAnnualIncomeStatement: async () => annual },
      shares: { getOutstandingCommonShares: async () => null } as never,
      dividendEvents: { listDividendDistributionRows: async () => rows } as never,
    });
    const batch = await computeDividendPayoutRatio({ symbol: '2330', year: '114', season: '4', dataType: '2', subsidiaryCompanyId: '' }, deps);
    return batch.slots.fy as MetricComputation;
  };
  const paid = await fy([row(2.5, 0), row(2.5, 1)]);
  expect(paid.value).toBe(50); // 公積發放的 1 元不算
  expect(paid.periodType).toBe('FY');
  expect(paid.knowledgeDate.toISOString().slice(0, 10) >= '2026-03-10').toBe(true);
  const none = await fy([]);
  expect(none.value).toBeNull();
  expect(none.nullReason).toBe('missing_input');
});
