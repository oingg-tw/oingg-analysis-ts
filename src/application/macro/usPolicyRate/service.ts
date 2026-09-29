import type { AppDeps } from '@/application/deps';
import type { UsPolicyRateEvent, UsPolicyRateResult } from './types';

export type UsPolicyRateDeps = Pick<AppDeps, 'macroData'>;

// 2026-09-29 使用者指示 web-nuxt 把美國政策利率放進總經特區（gov-ts 同日開 export.us_policy_rate）。跟 /macro/cbc-policy-rate
// 同一個模式：純轉發，唯一的加工是 changeBp（目標區間上限跟前一次調整的差，基點），`from` 過濾在算完 changeBp 之後做。
// 以上限算幅度：Fed 升降息是整個區間平移、上下限變動相同；唯一例外是 2008-12-16 單一目標值 1% → 區間 0–0.25%，以上限計 -75。
export const getUsPolicyRates = async (query: { from?: string }, deps: UsPolicyRateDeps): Promise<UsPolicyRateResult> => {
  const rows = await deps.macroData.listUsPolicyRatesAsc();

  const entries: UsPolicyRateEvent[] = rows.map((row, i) => ({
    effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
    targetUpper: row.targetUpper,
    targetLower: row.targetLower,
    changeBp: i === 0 ? null : Math.round((row.targetUpper - rows[i - 1]!.targetUpper) * 1000) / 10,
  }));

  return { entries: query.from ? entries.filter((e) => e.effectiveDate >= query.from!) : entries };
};
