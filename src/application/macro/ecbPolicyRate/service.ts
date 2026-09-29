import type { AppDeps } from '@/application/deps';
import type { EcbPolicyRateEvent, EcbPolicyRateResult } from './types';

export type EcbPolicyRateDeps = Pick<AppDeps, 'macroData'>;

// 2026-09-29 gov-ts 開 export.ecb_policy_rate、web-nuxt 要放進總經特區。跟 /macro/us-policy-rate 同一個模式：純轉發，唯一的加工是
// 調整幅度（基點），`from` 過濾在算完幅度之後做。跟美國那支不同的是**三支利率各給一個幅度**，不挑代表利率：ECB 有 7 次只動利率走廊
// （gov-ts 量的，例如 2019-09-18 只降存款機制利率），而 2024 起 ECB 自己的政策訊號是存款機制利率，只給 MRO 的幅度會把這些調整顯示成 0。
// 2000-06-28 那列三個利率都沒變、只換了標售機制（mainRefinancingIsMinimumBid），三個幅度都是 0。
const diffBp = (current: number | null, previous: number | null | undefined): number | null =>
  current === null || previous === null || previous === undefined ? null : Math.round((current - previous) * 1000) / 10;

export const getEcbPolicyRates = async (query: { from?: string }, deps: EcbPolicyRateDeps): Promise<EcbPolicyRateResult> => {
  const rows = await deps.macroData.listEcbPolicyRatesAsc();

  const entries: EcbPolicyRateEvent[] = rows.map((row, i) => {
    const prev = rows[i - 1];
    return {
      effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      depositFacilityRate: row.depositFacilityRate,
      mainRefinancingRate: row.mainRefinancingRate,
      marginalLendingRate: row.marginalLendingRate,
      mainRefinancingIsMinimumBid: row.mainRefinancingIsMinimumBid,
      depositFacilityChangeBp: diffBp(row.depositFacilityRate, prev?.depositFacilityRate),
      mainRefinancingChangeBp: diffBp(row.mainRefinancingRate, prev?.mainRefinancingRate),
      marginalLendingChangeBp: diffBp(row.marginalLendingRate, prev?.marginalLendingRate),
    };
  });

  return { entries: query.from ? entries.filter((e) => e.effectiveDate >= query.from!) : entries };
};
