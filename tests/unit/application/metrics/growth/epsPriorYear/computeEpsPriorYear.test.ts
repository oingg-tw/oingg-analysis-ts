import { expect, test } from 'vitest';
import { computeEpsPriorYear } from '@/application/metrics/growth/epsPriorYear/computeEpsPriorYear';
import { getEpsPriorYearProvenance } from '@/application/metrics/growth/epsPriorYear/getEpsPriorYearProvenance';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements } from '../../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-10-01 這支存在的理由：epsGrowthRate 的 |分母| 讓去年同季的正負號不可還原（6116 彩晶 −0.32 → 0.05）。
// 1,000 萬股、去年同季淨利 −3,200 千元 → −0.32 元；中間配股讓股數變 2 倍 → 換算到本季基準 −0.16 元，正負號保留。
const deps = (splitFactor: number) => {
  const statements = createInMemoryStatements({
    '6116': { '114Q2': { income: { netIncomeAttributableToParent: -3200n } }, '115Q2': { income: { netIncomeAttributableToParent: 500n } } },
  });
  return createTestPitDeps({
    statements,
    quarters: statements,
    announcements: createFixedAnnouncements(),
    shares: { getShareSplitFactor: async () => splitFactor, getShareBasisEvents: async () => ({ basisMultiplier: 1, events: [] }), getOutstandingCommonShares: async () => ({ outstandingCommonShares: 10_000_000n, issuedShares: 10_000_000n, preferredShares: 0n, treasuryShares: 0n, preferredCapitalThousands: 0n, preferredClaimThousands: 0n, preferredDividendsTtmThousands: 0n, effectiveYear: 2025, effectiveMonth: 1 }) },
  });
};
const query = { symbol: '6116', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' } as const;

test('去年同季虧損 → 負值保留（年增率取絕對值會丟掉的那個正負號），並換算到本季股數基準', async () => {
  const q = (await computeEpsPriorYear(query, deps(1))).slots.q;
  if (isComputationSkip(q)) throw new Error(JSON.stringify(q));
  expect((q as MetricComputation).value).toBe(-0.32);
  const restated = (await computeEpsPriorYear(query, deps(2))).slots.q as MetricComputation;
  expect(restated.value).toBe(-0.16);
});

test('溯源表的值等於寫入的值', async () => {
  const d = deps(2);
  const written = (await computeEpsPriorYear(query, d)).slots.q as MetricComputation;
  const prov = await getEpsPriorYearProvenance(query, d);
  expect(prov.found).toBe(true);
  expect(prov.value).toBe(written.value);
});

test('去年同季損益表整份缺 → insufficient_history', async () => {
  const statements = createInMemoryStatements({ '6116': { '115Q2': { income: { netIncomeAttributableToParent: 500n } } } });
  const d = createTestPitDeps({ statements, quarters: statements, announcements: createFixedAnnouncements(), shares: deps(1).shares });
  const q = (await computeEpsPriorYear(query, d)).slots.q as MetricComputation;
  expect(q.value).toBeNull();
  expect(q.nullReason).toBe('insufficient_history');
});
