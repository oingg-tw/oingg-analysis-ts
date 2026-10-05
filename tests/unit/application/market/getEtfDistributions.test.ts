import { expect, test } from 'vitest';
import { getEtfDistributions } from '@/application/market/etfDistributions/service';
import type { EtfDataPort, RawEtfDividendRow } from '@/application/ports/etfData';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 2026-10-05 近 12 個月＝除息日落在「今天往前一年（不含）～昨天」的已實現配息加總；今天以後是預告、不加。
const row = (ex: string, amount: number | null): RawEtfDividendRow => ({
  symbol: '0056', etf_name: '元大高股息', ex_dividend_date: new Date(`${ex}T00:00:00Z`), record_date: null, payment_date: null, distribution_per_unit: amount,
  composition_dividend_income_pct: null, composition_interest_income_pct: null, composition_income_equalization_pct: null, composition_realized_capital_gain_pct: null, composition_other_income_pct: null,
});
const deps = (rows: RawEtfDividendRow[]) => createTestDeps({ etfData: { listEtfDividendsForSymbol: async () => rows } as unknown as EtfDataPort });
const now = new Date('2026-10-05T03:00:00Z');

test('只加近 12 個月已實現：一年前當天不含、預告不含', async () => {
  const r = await getEtfDistributions('0056', deps([row('2025-10-05', 9), row('2025-10-16', 0.866), row('2026-07-16', 1), row('2026-10-05', 1.2), row('2026-10-20', null)]), now);
  expect(r.trailing12MonthDistributionPerUnit).toBe(1.866);
  expect(r.trailing12MonthWindow).toEqual({ start: '2025-10-06', end: '2026-10-04' });
  expect(r.events.map((e) => e.status)).toEqual(['realized', 'realized', 'realized', 'announced', 'announced']);
});

test('查無紀錄 → found=false、近 12 個月為 null（不是 0）', async () => {
  const r = await getEtfDistributions('9999', deps([]), now);
  expect(r).toMatchObject({ found: false, trailing12MonthDistributionPerUnit: null, events: [] });
});
