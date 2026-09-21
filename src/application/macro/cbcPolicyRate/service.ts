import type { AppDeps } from '@/application/deps';
import type { CbcPolicyRateEvent, CbcPolicyRateResult } from './types';

export type CbcPolicyRateDeps = Pick<AppDeps, 'macroData'>;

// 2026-09-21 web-nuxt 要求：使用者想做「大盤（/market/taiex-daily-price）疊加央行升降息事件」的圖，
// 需要事件型（一列一次調整）的政策利率序列。gov-ts 同日開了 export.cbc_policy_rate，本站沒有 DB 直連給
// bff 的路，所以由這裡純轉發；唯一的加工是 changeBp（跟前一次調整的重貼現率差，換算成基點），
// 免得前端自己 diff。`from` 過濾在算完 changeBp 之後做，窗口內第一筆的幅度才不會變成 null。
export const getCbcPolicyRates = async (query: { from?: string }, deps: CbcPolicyRateDeps): Promise<CbcPolicyRateResult> => {
  const rows = await deps.macroData.listCbcPolicyRatesAsc();

  const entries: CbcPolicyRateEvent[] = rows.map((row, i) => ({
    effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
    discountRate: row.discountRate,
    collateralAccommodationRate: row.collateralAccommodationRate,
    unsecuredAccommodationRate: row.unsecuredAccommodationRate,
    // 0.125% × 100 = 12.5bp；浮點誤差（1.875-1.75=0.12499…）用一位小數四捨五入收掉。
    changeBp: i === 0 ? null : Math.round((row.discountRate - rows[i - 1]!.discountRate) * 1000) / 10,
  }));

  return { entries: query.from ? entries.filter((e) => e.effectiveDate >= query.from!) : entries };
};
