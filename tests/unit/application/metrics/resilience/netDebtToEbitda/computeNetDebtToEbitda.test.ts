import { describe, expect, test } from 'vitest';
import { computeNetDebtToEbitda, NET_DEBT_TO_EBITDA_FORMULA_VERSION } from '@/application/metrics/resilience/netDebtToEbitda/computeNetDebtToEbitda';
import type { MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements, type StatementsSeed } from '../../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-09-22 formulaVersion 2 的邊界：EBITDA 為負要回 zero_or_negative_denominator，不能算出「負倍數」
// 冒充淨現金公司（S&P 分級表徽章 < 1.5x 會誤判通過）。真實數字（2330 = -0.67）由 cassette 測試守著。
const query = { symbol: '2330', year: '115', season: '2' as const, dataType: '2' as const, subsidiaryCompanyId: '' };
const announced = Object.fromEntries(['114Q3', '114Q4', '115Q1', '115Q2'].map((q, i) => [`2330-${q}`, new Date(Date.UTC(2025, 10 + i * 3, 13))]));

// 每季 EBITDA = 稅前 + 利息 + 折舊 + 攤銷
const quarters = (profitBeforeTax: bigint): StatementsSeed => ({
  '2330': Object.fromEntries(
    ['114Q3', '114Q4', '115Q1', '115Q2'].map((q) => [
      q,
      {
        income: { profitBeforeTax, financeCosts: 10n },
        cashFlow: { depreciation: 20n, amortization: 5n },
        ...(q === '115Q2' ? { balance: { shortTermBorrowings: 300n, bondsPayable: 0n, longTermBorrowings: 200n, cashAndEquivalents: 100n } } : {}),
      },
    ])
  ),
});

const run = async (seed: StatementsSeed) => {
  const statements = createInMemoryStatements(seed);
  const batch = await computeNetDebtToEbitda(query, createTestPitDeps({ statements, quarters: statements, announcements: createFixedAnnouncements(announced) }));
  return batch.slots.ttm as MetricComputation;
};

describe('computeNetDebtToEbitda', () => {
  test('EBITDA 為正：淨負債 400 / 四季 EBITDA 400 = 1.00，formulaVersion 2', async () => {
    const ttm = await run(quarters(65n)); // 每季 65+10+20+5 = 100
    expect(ttm).toMatchObject({ value: 1, nullReason: null, formulaVersion: NET_DEBT_TO_EBITDA_FORMULA_VERSION });
  });

  test('EBITDA 為負：不算負倍數，回 zero_or_negative_denominator', async () => {
    const ttm = await run(quarters(-135n)); // 每季 -135+10+20+5 = -100
    expect(ttm).toMatchObject({ value: null, nullReason: 'zero_or_negative_denominator' });
  });
});
