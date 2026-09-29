import { describe, expect, test } from 'vitest';
import { getUsPolicyRates } from '@/application/macro/usPolicyRate/service';
import type { MacroDataPort } from '@/application/ports/macroData';
import { createTestDeps } from '../../../fakes/createTestDeps';

// GET /macro/us-policy-rate 唯一的加工是 changeBp（目標區間上限跟前一次調整的差，基點）：釘住
// 「一碼是 25 不是 24.999…」「2008-12-16 單一目標值 → 區間（上下限同值 → 0~0.25）以上限計 -75」「from 過濾在算完幅度之後」。
const rates = (rows: [string, number, number][]): Pick<MacroDataPort, 'listUsPolicyRatesAsc'> => ({
  listUsPolicyRatesAsc: async () => rows.map(([d, u, l]) => ({ effectiveDate: new Date(d), targetUpper: u, targetLower: l })),
});

const seed: [string, number, number][] = [
  ['2008-10-29', 1, 1],
  ['2008-12-16', 0.25, 0],
  ['2015-12-17', 0.5, 0.25],
  ['2026-09-17', 4, 3.75],
];

describe('getUsPolicyRates', () => {
  test('changeBp 是上限相鄰差換算基點，第一筆 null；制度斷點以上限計', async () => {
    const deps = createTestDeps({ macroData: rates(seed) as MacroDataPort });
    const { entries } = await getUsPolicyRates({}, deps);
    expect(entries.map((e) => [e.effectiveDate, e.changeBp])).toEqual([
      ['2008-10-29', null],
      ['2008-12-16', -75],
      ['2015-12-17', 25],
      ['2026-09-17', 350],
    ]);
  });

  test('from 過濾在算完幅度之後，窗口內第一筆不會變 null', async () => {
    const deps = createTestDeps({ macroData: rates(seed) as MacroDataPort });
    const { entries } = await getUsPolicyRates({ from: '2015-01-01' }, deps);
    expect(entries.map((e) => e.changeBp)).toEqual([25, 350]);
  });
});
