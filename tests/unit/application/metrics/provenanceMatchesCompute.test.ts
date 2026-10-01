import { expect, test } from 'vitest';
import { computeCashFlowValuationFamily } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { getCroicProvenance } from '@/application/metrics/profitability/croic/getCroicProvenance';
import { computeEps } from '@/application/metrics/profitability/eps/computeEps';
import { getEpsProvenance } from '@/application/metrics/profitability/eps/getEpsProvenance';
import type { OutstandingCommonSharesAsOf } from '@/application/ports/capitalStock';
import { restatePerShareProvenance } from '@/application/metrics/shared/restatePerShareHistory';
import { createInMemoryStatements, type QuarterStatementSeed } from '../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../fakes/pit/createTestPitDeps';

// 2026-10-01 溯源表的 value 必須等於寫入的值。之前各支溯源表自己重算，漂掉過：croic 沒跟上 ×100、現金流估值家族沒有共用的
// 完整度條件（金控沒有營收 → 寫入 insufficient_history、溯源卻有值）、EPS 類沒扣特別股股利。現在溯源表直接讀 compute 的 resolver，
// 這裡守住兩個代表：退回各自重算就會在這裡對不上。每股類對外再換算到今天的股數基準（跟 metric-history 一致），最後一個 test 守住。
const QUARTERS = ['114Q3', '114Q4', '115Q1', '115Q2'];
const query = { symbol: '9999', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' } as const;
const slotValue = (slot: unknown) => (slot as { value: number | null }).value;

const cashFlowDeps = (withRevenue: boolean) => {
  const quarter: QuarterStatementSeed = {
    income: { operatingRevenue: withRevenue ? 1000n : null, netIncome: 100n, netIncomeAttributableToParent: 100n },
    cashFlow: { netCashFromOperatingActivities: 300n, capitalExpenditures: -100n },
    balance: { shortTermBorrowings: 1000n, equityAttributableToParent: 3000n, cashAndEquivalents: 0n },
  };
  const statements = createInMemoryStatements({ '9999': Object.fromEntries(QUARTERS.map((q) => [q, quarter])) });
  return createTestPitDeps({ statements, quarters: statements, announcements: createFixedAnnouncements(), market: { getMarketCap: async () => null } as never });
};

test('croic 溯源 = 寫入值：FCF 800 ÷ 投入資本 4000 × 100 = 20（不是 0.2）；營收缺漏時兩邊都是 null', async () => {
  const deps = cashFlowDeps(true);
  const written = slotValue((await computeCashFlowValuationFamily(query, deps)).slots.croic);
  expect(written).toBe(20);
  expect((await getCroicProvenance(query, deps)).value).toBe(written);

  const gated = cashFlowDeps(false);
  expect(slotValue((await computeCashFlowValuationFamily(query, gated)).slots.croic)).toBeNull();
  expect((await getCroicProvenance(query, gated)).value).toBeNull();
});

test('eps 溯源 = 寫入值：(近一年淨利 400 − 特別股股利 40) × 1000 ÷ 普通股 100,000 = 3.6，並列出特別股股利', async () => {
  const statements = createInMemoryStatements({ '9999': Object.fromEntries(QUARTERS.map((q) => [q, { income: { netIncomeAttributableToParent: 100n } }])) });
  const shares: OutstandingCommonSharesAsOf = {
    outstandingCommonShares: 100_000n,
    issuedShares: 110_000n,
    preferredShares: 10_000n,
    treasuryShares: 0n,
    preferredCapitalThousands: 100n,
    preferredClaimThousands: 100n,
    preferredDividendsTtmThousands: 40n,
    effectiveYear: 2026,
    effectiveMonth: 1,
  };
  const deps = createTestPitDeps({
    statements,
    quarters: statements,
    announcements: createFixedAnnouncements(),
    shares: { getOutstandingCommonShares: async () => shares } as never,
    annualReports: { getAnnualIncomeStatement: async () => null } as never,
  });
  const written = slotValue((await computeEps(query, deps)).slots.ttm);
  expect(written).toBe(3.6);
  const provenance = await getEpsProvenance(query, deps);
  expect(provenance.value).toBe(written);
  expect(provenance.entries.find((e) => e.role.startsWith('近四季特別股股利'))?.value).toBe('40');
});

test('每股類溯源值換算到今天的股數基準（跟 metric-history 同一支倍數）；比率類不動', async () => {
  const deps = { shares: { getShareBasisEvents: async () => ({ basisMultiplier: 1, events: [] }), getShareSplitFactor: async () => 1.05 } as never };
  const base = { symbol: '1235', found: true, fiscalYear: 2026, fiscalQuarter: 2, entries: [], methodologyNote: null };
  const eps = await restatePerShareProvenance({ ...base, metricCode: 'eps', value: 3.6 }, deps);
  expect(eps.value).toBe(3.43); // 3.6 ÷ 1.05
  expect(eps.entries.map((e) => e.value)).toEqual([3.6, 1.05]);
  expect((await restatePerShareProvenance({ ...base, metricCode: 'peRatio', value: 20 }, deps)).value).toBe(20);
});
