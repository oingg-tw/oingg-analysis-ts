import { describe, expect, test } from 'vitest';
import { getEcbPolicyRates } from '@/application/macro/ecbPolicyRate/service';
import type { MacroDataPort } from '@/application/ports/macroData';
import { createTestDeps } from '../../../fakes/createTestDeps';

// GET /macro/ecb-policy-rate 唯一的加工是三支利率各自的 changeBp：釘住「只動走廊時 MRO 是 0」「負利率」「只換標售機制那列三個都是 0」
// 「前一筆 null 時 null（不是當 0）」「from 過濾在算完幅度之後」。
type Row = [string, number | null, number | null, number | null, boolean];
const rates = (rows: Row[]): Pick<MacroDataPort, 'listEcbPolicyRatesAsc'> => ({
  listEcbPolicyRatesAsc: async () =>
    rows.map(([d, dfr, mro, mlf, minBid]) => ({ effectiveDate: new Date(d), depositFacilityRate: dfr, mainRefinancingRate: mro, marginalLendingRate: mlf, mainRefinancingIsMinimumBid: minBid })),
});

const seed: Row[] = [
  ['2000-06-09', 3.25, 4.25, 5.25, false],
  ['2000-06-28', 3.25, 4.25, 5.25, true], // 只換標售機制
  ['2019-09-18', -0.4, 0, 0.25, false],
  ['2019-10-01', -0.5, 0, 0.25, false], // 只降存款機制利率（走廊）
  ['2024-06-12', null, 4.25, 4.5, false],
  ['2024-09-18', 3.5, 3.65, 3.9, false],
];

describe('getEcbPolicyRates', () => {
  test('三支利率各自算幅度，第一筆 null、前一筆 null 時 null', async () => {
    const deps = createTestDeps({ macroData: rates(seed) as MacroDataPort });
    const { entries } = await getEcbPolicyRates({}, deps);
    expect(entries.map((e) => [e.effectiveDate, e.depositFacilityChangeBp, e.mainRefinancingChangeBp, e.marginalLendingChangeBp, e.mainRefinancingIsMinimumBid])).toEqual([
      ['2000-06-09', null, null, null, false],
      ['2000-06-28', 0, 0, 0, true],
      ['2019-09-18', -365, -425, -500, false],
      ['2019-10-01', -10, 0, 0, false],
      ['2024-06-12', null, 425, 425, false],
      ['2024-09-18', null, -60, -60, false],
    ]);
  });

  test('from 過濾在算完幅度之後，窗口內第一筆不會變 null', async () => {
    const deps = createTestDeps({ macroData: rates(seed) as MacroDataPort });
    const { entries } = await getEcbPolicyRates({ from: '2019-10-01' }, deps);
    expect(entries.map((e) => e.depositFacilityChangeBp)).toEqual([-10, null, null]);
  });
});
