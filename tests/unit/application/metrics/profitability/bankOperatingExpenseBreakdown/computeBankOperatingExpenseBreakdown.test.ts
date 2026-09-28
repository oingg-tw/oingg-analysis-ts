import { expect, test } from 'vitest';
import { computeBankOperatingExpenseBreakdown } from '@/application/metrics/profitability/bankOperatingExpenseBreakdown/computeBankOperatingExpenseBreakdown';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements } from '../../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-09-28 銀行／金控營業費用三分拆：2801 115Q2 單季（千元）員工福利 3,681,321 + 折舊攤銷 464,183 + 其他業管 1,587,453 = 營業費用 5,732,957。
const opex = (e: bigint, d: bigint, o: bigint) => ({ income: {}, bankOperatingExpense: { employeeBenefits: e, depreciationAmortisation: d, otherGeneralAdministrative: o } });
const run = async (seed: Parameters<typeof createInMemoryStatements>[0], isFinancial = true) => {
  const statements = createInMemoryStatements(seed);
  const deps = createTestPitDeps({
    statements,
    quarters: statements,
    announcements: createFixedAnnouncements(),
    industry: { isFinancialIndustryCompany: async () => isFinancial } as never,
    shares: { getOutstandingCommonShares: async () => ({ outstandingCommonShares: 1_000_000n }) } as never,
  });
  return computeBankOperatingExpenseBreakdown({ symbol: '2801', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' }, deps);
};

test('單季每股 = 金額 × 1000 ÷ 股數；近四季四季齊才加總，三支加總還原營業費用', async () => {
  const batch = await run({ '2801': { '114Q3': opex(10n, 1n, 5n), '114Q4': opex(10n, 1n, 5n), '115Q1': opex(3615011n, 450787n, 1426576n), '115Q2': opex(3681321n, 464183n, 1587453n) } });
  const v = (slot: string) => (batch.slots[slot as keyof typeof batch.slots] as MetricComputation).value;
  expect(v('bankEmployeeBenefitsExpensePerShareQ')).toBe(3681.32);
  expect(v('bankDepreciationAmortisationExpensePerShareQ')).toBe(464.18);
  expect(v('bankOtherGeneralAdministrativeExpensePerShareQ')).toBe(1587.45);
  expect(v('bankEmployeeBenefitsExpensePerShareTtm')).toBe(7296.35); // 10+10+3,615,011+3,681,321
});

test('近四季缺一季的某個成分 → TTM insufficient_history，單季照算', async () => {
  const batch = await run({ '2801': { '114Q4': opex(10n, 1n, 5n), '115Q1': opex(1n, 1n, 1n), '115Q2': opex(3681321n, 464183n, 1587453n) } });
  const ttm = batch.slots.bankOtherGeneralAdministrativeExpensePerShareTtm as MetricComputation;
  expect(ttm.value).toBeNull();
  expect(ttm.nullReason).toBe('insufficient_history');
  expect((batch.slots.bankOtherGeneralAdministrativeExpensePerShareQ as MetricComputation).value).toBe(1587.45);
});

test('非金融業、或這一季沒有這組科目（券商、保險）→ 整批跳過不寫', async () => {
  const general = await run({ '2801': { '115Q2': opex(1n, 1n, 1n) } }, false);
  expect(Object.values(general.slots).every(isComputationSkip)).toBe(true);
  const broker = await run({ '2801': { '115Q2': { income: {} } } });
  expect(Object.values(broker.slots).every(isComputationSkip)).toBe(true);
});
