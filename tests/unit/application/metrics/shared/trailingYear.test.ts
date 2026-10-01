import { describe, expect, test } from 'vitest';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';
import { resolveAverageBalances } from '@/application/metrics/shared/averageBalances';
import type { CumulativeStatementsPort } from '@/application/ports/cumulativeStatements';
import { createInMemoryStatements, quarterEndDate, type StatementsSeed } from '../../../../fakes/pit/inMemoryStatements';
import { createTestPitDeps } from '../../../../fakes/pit/createTestPitDeps';

// 2026-10-01 興櫃半年頻：上市櫃走四季（值不變）、興櫃走「上年度下半年＋本年度上半年」，缺漏不會被誤判成半年報。
const key = { symbol: 'X', rocYear: 115, season: '2' as const, dataType: '2', subsidiaryCompanyId: '' };

// 累計數：114 年上半年 400、全年 1000；115 年上半年 500。股利：114 上半年沒配（null）、全年 −60。
const cumulative: CumulativeStatementsPort = {
  getCumulativeIncomeStatement: async ({ year, quarter }) => {
    const v = ({ '114-2': 400n, '114-4': 1000n, '115-2': 500n } as Record<string, bigint>)[`${year}-${quarter}`];
    return v === undefined ? null : ({ reportDate: quarterEndDate(year, quarter), netIncome: v, operatingRevenue: v * 10n } as never);
  },
  getCumulativeCashFlowStatement: async ({ year, quarter }) => {
    const v = ({ '114-2': null, '114-4': -60n, '115-2': -10n } as Record<string, bigint | null>)[`${year}-${quarter}`];
    return v === undefined ? null : ({ reportDate: quarterEndDate(year, quarter), dividendsPaid: v, netCashFromOperatingActivities: 1n } as never);
  },
};

const depsFor = (seed: StatementsSeed) => createTestPitDeps({ statements: createInMemoryStatements(seed), cumulativeStatements: cumulative });

describe('resolveTrailingIncomeStatements', () => {
  test('上市櫃：四季都有數字 → 四季原樣回傳，跟改版前每支指標自己抓的完全一樣', async () => {
    const seed: StatementsSeed = { X: { '114Q3': { income: { netIncome: 1n } }, '114Q4': { income: { netIncome: 2n } }, '115Q1': { income: { netIncome: 3n } }, '115Q2': { income: { netIncome: 4n } } } };
    const r = await resolveTrailingIncomeStatements(key, depsFor(seed));
    expect(r.basis).toBe('quarters');
    expect(r.periods.map((p) => [p.year, p.season, p.record?.netIncome])).toEqual([['114', '3', 1n], ['114', '4', 2n], ['115', '1', 3n], ['115', '2', 4n]]);
  });

  test('興櫃：奇數季整列缺、偶數季列在但全空 → 上年度下半年（1000−400）＋本年度上半年（500）', async () => {
    const seed: StatementsSeed = { X: { '114Q4': { income: {} }, '115Q2': { income: {} } } };
    const r = await resolveTrailingIncomeStatements(key, depsFor(seed));
    expect(r.basis).toBe('semiannual');
    expect(r.periods.map((p) => [p.year, p.season, p.record?.netIncome])).toEqual([['114', '4', 600n], ['115', '2', 500n]]);
  });

  test('只缺奇數季、偶數季有真實數字（資料缺漏）→ 仍走四季、照樣不齊，不被累計數悄悄補上', async () => {
    const seed: StatementsSeed = { X: { '114Q4': { income: { netIncome: 2n } }, '115Q2': { income: { netIncome: 4n } } } };
    const r = await resolveTrailingIncomeStatements(key, depsFor(seed));
    expect(r.basis).toBe('quarters');
    expect(r.periods.filter((p) => p.record === null)).toHaveLength(2);
  });

  test('現金流量表跟著損益表判斷；股利 null＝沒發，當 0 相減：上年度下半年 −60、本年度上半年 −10', async () => {
    const seed: StatementsSeed = { X: { '114Q4': { income: {} }, '115Q2': { income: {} } } };
    const r = await resolveTrailingCashFlowStatements(key, depsFor(seed));
    expect(r.basis).toBe('semiannual');
    expect(r.periods.map((p) => p.record?.dividendsPaid)).toEqual([-60n, -10n]);
  });
});

describe('resolveAverageBalances 半年頻', () => {
  test('奇數季末整列缺 → TTM 用 3 點平均（t−4、t−2、t）；Q 平均缺 t−1 仍是 null', async () => {
    const seed: StatementsSeed = { X: { '114Q2': { balance: { equityAttributableToParent: 300n } }, '114Q4': { balance: { equityAttributableToParent: 600n } }, '115Q2': { balance: { equityAttributableToParent: 900n } } } };
    const b = await resolveAverageBalances(key, depsFor(seed));
    expect(b.equityAvgTtm).toBe(600n);
    expect(b.equityAvgQ).toBeNull();
  });

  test('上市櫃五點齊全 → 五點平均不變', async () => {
    const eq = (v: bigint) => ({ balance: { equityAttributableToParent: v } });
    const seed: StatementsSeed = { X: { '114Q2': eq(100n), '114Q3': eq(200n), '114Q4': eq(300n), '115Q1': eq(400n), '115Q2': eq(500n) } };
    expect((await resolveAverageBalances(key, depsFor(seed))).equityAvgTtm).toBe(300n);
  });
});
