import { expect, test } from 'vitest';
import { computeEpsGrowthRate } from '@/application/metrics/growth/epsGrowthRate/computeEpsGrowthRate';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements } from '../../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-09-22 web-nuxt 抓到的假精度：v1 拿已進位到「分」的 EPS 相除。台泥 2026Q1 的案例——真值 0.0661 → 0.0900 是 +36.2%，
// 進位成 0.07 → 0.09 後變 +28.57%。這裡用 1,000,000 股、淨利 66.1 千元 → 90.0 千元重現：EPS 0.0661 / 0.0900。
test('epsGrowthRate 用未進位的 EPS 計算：0.0661 → 0.0900 是 36.16%，不是進位後的 28.57%', async () => {
  const statements = createInMemoryStatements({
    '1101': {
      '114Q1': { income: { netIncomeAttributableToParent: 661n } }, // 66.1 千元 → 0.0661 元/股（下面 1e7 股）
      '115Q1': { income: { netIncomeAttributableToParent: 900n } },
    },
  });
  const deps = createTestPitDeps({
    statements,
    quarters: statements,
    announcements: createFixedAnnouncements({ '1101-114Q1': new Date('2025-05-14T00:00:00.000Z'), '1101-115Q1': new Date('2026-05-14T00:00:00.000Z') }),
    shares: { getPaidInShares: async () => ({ paidInShares: 10_000_000n, effectiveYear: 2025, effectiveMonth: 1 }) },
  });

  const batch = await computeEpsGrowthRate({ symbol: '1101', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' }, deps);
  const q = batch.slots.q;
  if (isComputationSkip(q)) throw new Error(`預期算得出來，卻是 ${JSON.stringify(q)}`);
  expect((q as MetricComputation).value).toBe(36.16);
  expect((q as MetricComputation).formulaVersion).toBe(2);
});
