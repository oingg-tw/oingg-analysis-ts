import { expect, test } from 'vitest';
import { getRuleOf40Provenance } from '@/application/metrics/growth/ruleOf40/getRuleOf40Provenance';
import { createInMemoryStatements, type QuarterStatementSeed } from '../../../fakes/pit/inMemoryStatements';
import { createTestPitDeps } from '../../../fakes/pit/createTestPitDeps';

// 2026-10-01 ruleOf40 溯源表：value 走 compute 同一支 resolver，這裡守住「營收成長率 + FCF 利潤率」與逐期列出、非軟體業擋門。
const quarter = (revenue: bigint): QuarterStatementSeed => ({ income: { operatingRevenue: revenue }, cashFlow: { netCashFromOperatingActivities: 30n, capitalExpenditures: -10n } });
const seed = {
  '6214': {
    ...Object.fromEntries(['113Q3', '113Q4', '114Q1', '114Q2'].map((q) => [q, quarter(100n)])),
    ...Object.fromEntries(['114Q3', '114Q4', '115Q1', '115Q2'].map((q) => [q, quarter(125n)])),
  },
};
const depsFor = (isSoftware: boolean) => {
  const statements = createInMemoryStatements(seed);
  return createTestPitDeps({ statements, quarters: statements, industry: { isSoftwareOrCloudIndustryCompany: async () => isSoftware } as never });
};
const query = { symbol: '6214', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' } as const;

test('Rule of 40 = 近一年營收成長率 25% + FCF 利潤率 16% = 41；本期四季三欄＋去年同期四季營收逐筆列出', async () => {
  const result = await getRuleOf40Provenance(query, depsFor(true));
  expect(result.value).toBe(41); // (500 − 400) ÷ 400 = 25%；(30 − 10) × 4 ÷ 500 = 16%
  expect(result.entries).toHaveLength(4 * 3 + 4);
  expect(result.entries[0]!.role).toBe('本期近一年 114 年第 3 季：營業收入');
  expect(result.entries.at(-1)).toMatchObject({ role: '去年同期近一年 114 年第 2 季：營業收入（成長率分母）', fiscalYear: 2025, fiscalQuarter: 2, value: '100' });
});

test('非軟體雲端業 found=false（寫入路徑本來就不寫列）', async () => {
  expect((await getRuleOf40Provenance(query, depsFor(false))).found).toBe(false);
});
