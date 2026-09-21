import { describe, expect, test } from 'vitest';
import { getCbcPolicyRates } from '@/application/macro/cbcPolicyRate/service';
import type { MacroDataPort } from '@/application/ports/macroData';
import { createTestDeps } from '../../../fakes/createTestDeps';

// GET /macro/cbc-policy-rate 唯一的加工是 changeBp（跟前一次調整的重貼現率差，基點）：釘住
// 「浮點差要收成 12.5 不是 12.499…」「整段歷史第一筆是 null」「from 過濾在算完幅度之後，窗口內第一筆不會變 null」。
const rates = (rows: [string, number][]): Pick<MacroDataPort, 'listCbcPolicyRatesAsc'> => ({
  listCbcPolicyRatesAsc: async () =>
    rows.map(([d, r]) => ({ effectiveDate: new Date(d), discountRate: r, collateralAccommodationRate: r + 0.375, unsecuredAccommodationRate: r + 2.25 })),
});

const seed: [string, number][] = [
  ['2022-06-17', 1.5],
  ['2022-09-23', 1.625],
  ['2022-12-16', 1.75],
  ['2023-03-24', 1.875],
  ['2024-03-22', 2],
];

describe('getCbcPolicyRates', () => {
  test('changeBp 是重貼現率相鄰差換算基點，第一筆 null，由舊到新', async () => {
    const deps = createTestDeps({ macroData: rates(seed) as MacroDataPort });
    const { entries } = await getCbcPolicyRates({}, deps);
    expect(entries.map((e) => [e.effectiveDate, e.changeBp])).toEqual([
      ['2022-06-17', null],
      ['2022-09-23', 12.5],
      ['2022-12-16', 12.5],
      ['2023-03-24', 12.5],
      ['2024-03-22', 12.5],
    ]);
    expect(entries[0]).toMatchObject({ discountRate: 1.5, collateralAccommodationRate: 1.875, unsecuredAccommodationRate: 3.75 });
  });

  test('from 過濾後窗口內第一筆仍有 changeBp；降息是負數', async () => {
    const deps = createTestDeps({ macroData: rates([['2019-01-01', 1.375], ['2020-03-20', 1.125], ...seed]) as MacroDataPort });
    const { entries } = await getCbcPolicyRates({ from: '2020-01-01' }, deps);
    expect(entries[0]).toMatchObject({ effectiveDate: '2020-03-20', changeBp: -25 });
    expect(entries).toHaveLength(6);
  });
});
