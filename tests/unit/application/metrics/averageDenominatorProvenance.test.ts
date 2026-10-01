import { expect, test } from 'vitest';
import { getRoaProvenance } from '@/application/metrics/profitability/roa/getRoaProvenance';
import { getInventoryTurnoverProvenance } from '@/application/metrics/efficiency/inventoryTurnover/getInventoryTurnoverProvenance';
import { createInMemoryStatements, type QuarterStatementSeed } from '../../../fakes/pit/inMemoryStatements';
import { createTestPitDeps } from '../../../fakes/pit/createTestPitDeps';

// 2026-10-01 溯源表分母對帳：2026-09-22 分母改平均後，週轉率家族／roa 等溯源表還在用本季期末值，value 跟儲存值對不上。
// 溯源表改讀 compute 的 resolver 之後，這裡守住「value 用的是 5 點平均分母、逐點列出 5 個季末」——退回期末值會算出 8 / 2.4。
const quarter = (assets: bigint, inventory: bigint): QuarterStatementSeed => ({
  income: { netIncomeAttributableToParent: 10n, operatingRevenue: 100n, operatingCost: 30n },
  balance: { totalAssets: assets, inventory },
});
const statements = createInMemoryStatements({
  '1234': { '114Q2': quarter(100n, 10n), '114Q3': quarter(200n, 20n), '114Q4': quarter(300n, 30n), '115Q1': quarter(400n, 40n), '115Q2': quarter(500n, 50n) },
});
const deps = createTestPitDeps({ statements, quarters: statements });
const query = { symbol: '1234', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' } as const;

test('roa 溯源：近一年淨利 40 ÷ 5 點平均總資產 300 = 13.33%，逐點列出 5 個季末', async () => {
  const result = await getRoaProvenance(query, deps);
  expect(result.value).toBe(13.33);
  const points = result.entries.filter((e) => e.statementType === 'balanceSheet');
  expect(points.map((e) => e.value)).toEqual(['100', '200', '300', '400', '500']);
  expect(points[0]).toMatchObject({ role: '平均分母第 1/5 點（114 年第 2 季末總資產）', fiscalYear: 2025, fiscalQuarter: 2, fieldKey: 'assets' });
  expect(result.entries.at(-1)).toMatchObject({ type: 'other', value: '300' });
});

test('inventoryTurnover 溯源：近一年營業成本 120 ÷ 5 點平均存貨 30 = 4', async () => {
  const result = await getInventoryTurnoverProvenance(query, deps);
  expect(result.value).toBe(4);
  expect(result.entries.filter((e) => e.statementType === 'balanceSheet')).toHaveLength(5);
});
