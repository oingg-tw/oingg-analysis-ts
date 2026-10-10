import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';

// gov-ts 的美國聯邦基金利率目標歷次調整事件（export.us_policy_rate，2026-09-29 開的 view，1982-09-27 起）——
// 縫合 FRED DFEDTAR（1982–2008 單一目標值）＋ DFEDTARU／DFEDTARL（2008-12-16 起目標區間），gov-ts 已把單一目標值那段
// 存成上下限同值，所以一套欄位跨得過那條制度斷點。形狀跟 cbc_policy_rate 對稱；numeric(8,4) 百分比，轉 number 在 port 做。
export interface RawUsPolicyRateRow {
  effective_date: Date;
  target_upper: unknown;
  target_lower: unknown;
}

// 全部歷史，依生效日升冪（application 要跟前一列相減算調整幅度）。
export const listAllUsPolicyRatesAsc = (): Promise<RawUsPolicyRateRow[]> =>
  govExportPrisma.$queryRaw<RawUsPolicyRateRow[]>`
    SELECT effective_date, target_upper, target_lower FROM "export"."v_us_policy_rates" ORDER BY effective_date ASC
  `;
