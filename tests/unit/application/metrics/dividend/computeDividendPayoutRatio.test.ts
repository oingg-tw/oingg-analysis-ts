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
  const deps = createTestPitDeps({ statements, quarters: statements, announcements: createFixedAnnouncements() });
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
