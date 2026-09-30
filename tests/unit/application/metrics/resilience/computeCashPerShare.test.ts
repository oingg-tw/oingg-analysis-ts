import { expect, test } from 'vitest';
import { computeCashPerShare } from '@/application/metrics/resilience/cashPerShare/computeCashPerShare';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements } from '../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../fakes/pit/createTestPitDeps';

// 釘住三件事：千元換元（×1000）、分母是 IAS 33 流通在外普通股（扣掉特別股與庫藏股之後）、缺現金是 missing_input 不是 0。
const sharesPort = (outstanding: bigint) => ({
  getShareSplitFactor: async () => 1,
  getShareBasisEvents: async () => ({ basisMultiplier: 1, events: [] }),
  getOutstandingCommonShares: async () => ({
    outstandingCommonShares: outstanding,
    issuedShares: outstanding + 1_000_000n,
    preferredShares: 0n,
    treasuryShares: 1_000_000n,
    preferredCapitalThousands: 0n,
    preferredClaimThousands: 0n,
    preferredDividendsTtmThousands: 0n,
    effectiveYear: 2026,
    effectiveMonth: 6,
  }),
});

const run = async (cash: bigint | null, outstanding: bigint) => {
  const statements = createInMemoryStatements({ '1101': { '115Q2': { balance: { cashAndEquivalents: cash } } } });
  const deps = createTestPitDeps({
    statements,
    quarters: statements,
    announcements: createFixedAnnouncements({ '1101-115Q2': new Date('2026-08-12T00:00:00.000Z') }),
    shares: sharesPort(outstanding),
  });
  const batch = await computeCashPerShare({ symbol: '1101', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' }, deps);
  const q = batch.slots.q;
  if (isComputationSkip(q)) throw new Error(`預期寫入一筆，卻是 ${JSON.stringify(q)}`);
  return q as MetricComputation;
};

test('現金 50,000,000 千元 / 7,000,000,000 股 = 7.14 元', async () => {
  const q = await run(50_000_000n, 7_000_000_000n);
  expect(q.value).toBe(7.14);
  expect(q.nullReason).toBeNull();
  expect(q.periodType).toBe('Q');
});

test('缺現金科目是 missing_input；股數為 0 是 zero_or_negative_denominator', async () => {
  expect(await run(null, 7_000_000_000n)).toMatchObject({ value: null, nullReason: 'missing_input' });
  expect(await run(50_000_000n, 0n)).toMatchObject({ value: null, nullReason: 'zero_or_negative_denominator' });
});
