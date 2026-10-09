import { expect, test } from 'vitest';
import { computeLiabilityComposition } from '@/application/metrics/resilience/liabilityComposition/computeLiabilityComposition';
import { getLiabilityCompositionProvenance } from '@/application/metrics/resilience/liabilityComposition/getLiabilityCompositionProvenance';
import { computeDebtRatio } from '@/application/metrics/resilience/debtRatio/computeDebtRatio';
import { createInMemoryStatements } from '../../../fakes/pit/inMemoryStatements';
import { createTestPitDeps } from '../../../fakes/pit/createTestPitDeps';
import { createFixedAnnouncements } from '../../../fakes/pit/fixedAnnouncements';

// 2026-10-09 負債比率拆流動／非流動：守住「兩支相加＝debtRatio」（web-nuxt 只畫相加等於母項的期別）、缺科目就 null、溯源跟 compute 一致。
const depsFor = (balance: Record<string, bigint | null>) => {
  const statements = createInMemoryStatements({ '1101': { '115Q2': { balance } } });
  return createTestPitDeps({ statements, quarters: statements, announcements: createFixedAnnouncements() });
};
const query = { symbol: '1101', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' } as const;
const valueOf = (slot: unknown) => (slot as { value: number | null }).value;

test('流動 + 非流動 ＝ 負債比率', async () => {
  const deps = depsFor({ totalAssets: 1_000_000n, totalLiabilities: 452_300n, currentLiabilities: 301_100n, noncurrentLiabilities: 151_200n });
  const { slots } = await computeLiabilityComposition(query, deps);
  const debt = await computeDebtRatio(query, deps);
  expect(valueOf(slots.currentLiabilitiesToAssets)).toBe(30.11);
  expect(valueOf(slots.nonCurrentLiabilitiesToAssets)).toBe(15.12);
  expect(valueOf(slots.currentLiabilitiesToAssets)! + valueOf(slots.nonCurrentLiabilitiesToAssets)!).toBeCloseTo(valueOf(debt.slots.q)!, 2);
});

test('缺非流動負債科目 → 那一支 null（missing_input），另一支照算', async () => {
  const { slots } = await computeLiabilityComposition(query, depsFor({ totalAssets: 1_000_000n, currentLiabilities: 301_100n }));
  expect(valueOf(slots.currentLiabilitiesToAssets)).toBe(30.11);
  expect(valueOf(slots.nonCurrentLiabilitiesToAssets)).toBeNull();
  expect((slots.nonCurrentLiabilitiesToAssets as { nullReason: string }).nullReason).toBe('missing_input');
});

test('溯源表的值跟 compute 一致', async () => {
  const deps = depsFor({ totalAssets: 1_000_000n, currentLiabilities: 301_100n, noncurrentLiabilities: 151_200n });
  const result = await getLiabilityCompositionProvenance('nonCurrentLiabilitiesToAssets', deps)(query);
  expect(result.value).toBe(15.12);
  expect(result.entries.map((e) => e.fieldKey)).toEqual(['noncurrent_liabilities', 'assets']);
});
