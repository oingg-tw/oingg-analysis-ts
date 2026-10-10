import { describe, expect, test } from 'vitest';
import { getCpi, getFiveMajorBankRates, getGdp, getUsdTwdRates } from '@/application/macro/series/service';
import type { MacroSeriesPort } from '@/application/ports/macroData';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 總經特區六支端點的共用邏輯只有兩件事：period 字串怎麼組（月補零、季用 Qn）、`from` 用字典序過濾。
// 釘住這兩件事跟日資料的「由新到舊查、回傳反轉成由舊到新」。
const macroSeries = {
  listCpiAsc: async (category) => [
    { year: 2025, month: 12, indexValue: 110.1, yoyChangePct: 1.8 },
    { year: 2026, month: 1, indexValue: 110.5, yoyChangePct: category === 'total' ? 2.1 : 9.9 },
  ],
  listGdpAsc: async () => [
    { year: 2025, quarter: 4, contributionPoints: 6.2 },
    { year: 2026, quarter: 1, contributionPoints: 15.43 },
  ],
  listFiveMajorBankRatesAsc: async () => [
    { year: 2026, month: 7, depositRate1m: 1.23, depositRate1y: 1.7, baseLendingRate: 3.265 },
    { year: 2026, month: 8, depositRate1m: 1.23, depositRate1y: 1.7, baseLendingRate: 3.265 },
  ],
  listLatestUsdTwdRates: async (limit) =>
    [
      { tradeDate: new Date('2026-07-31'), bankBuyingRate: 32.26, bankSellingRate: 32.36, interbankClosingRate: 32.292 },
      { tradeDate: new Date('2026-07-30'), bankBuyingRate: 32.2, bankSellingRate: 32.3, interbankClosingRate: null },
    ].slice(0, limit),
} satisfies Partial<MacroSeriesPort>;

const deps = createTestDeps({ macroSeries: macroSeries as unknown as MacroSeriesPort });

describe('macro series', () => {
  // 2026-10-07 短天期無風險利率：百分比數字原樣（1.7 不是 0.017）、latestPeriod 是整段最新一筆，不受 from 影響。
  test('五大銀行利率：百分比原樣、from 過濾、latestPeriod 是最新一筆', async () => {
    const r = await getFiveMajorBankRates({ from: '2026-08' }, deps);
    expect(r).toEqual({ latestPeriod: '2026-08', entries: [{ period: '2026-08', year: 2026, month: 8, depositRate1mPct: 1.23, depositRate1yPct: 1.7, baseLendingRatePct: 3.265 }] });
    expect((await getFiveMajorBankRates({ from: '2027-01' }, deps)).latestPeriod).toBe('2026-08');
  });

  test('月 period 補零、from 用字典序過濾、回應帶回 category', async () => {
    const all = await getCpi({ category: 'total' }, deps);
    expect(all.entries.map((e) => e.period)).toEqual(['2025-12', '2026-01']);
    const filtered = await getCpi({ category: 'food', from: '2026-01' }, deps);
    expect(filtered).toMatchObject({ category: 'food', entries: [{ period: '2026-01', year: 2026, month: 1, yoyChangePct: 9.9 }] });
  });

  test('季 period 用 Qn，from 過濾同樣字典序', async () => {
    const r = await getGdp({ category: 'growth_rate', from: '2026-Q1' }, deps);
    expect(r.entries).toEqual([{ period: '2026-Q1', year: 2026, quarter: 1, contributionPoints: 15.43 }]);
  });

  test('日匯率：port 由新到舊，回應反轉成由舊到新、tradeDate 是 YYYY-MM-DD', async () => {
    const r = await getUsdTwdRates(2, 'daily', deps);
    expect(r.entries.map((e) => e.tradeDate)).toEqual(['2026-07-30', '2026-07-31']);
    expect(r.entries[0]!.interbankClosingRate).toBeNull();
  });
});
