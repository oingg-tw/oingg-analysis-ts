import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';

// gov-ts 的央行政策利率歷次調整事件（export.cbc_policy_rate，來源是央行統計資料庫 EG28D01en）——
// 2026-09-21 gov-ts 開的 view，一列就是一次利率調整的生效日（不是逐日/逐月快照），1989-04-01 起。
// 三個利率同日同步調整；utility 欄位 numeric(8,4) 是百分比數字（2.0000 = 2%），轉 number 在呼叫端做。
export interface RawCbcPolicyRateRow {
  effective_date: Date;
  discount_rate: unknown;
  collateral_accommodation_rate: unknown;
  unsecured_accommodation_rate: unknown;
}

// 全部歷史，依生效日升冪（application 要跟前一列相減算調整幅度，所以一律拿整段）。
export const listAllCbcPolicyRatesAsc = (): Promise<RawCbcPolicyRateRow[]> =>
  govExportPrisma.$queryRaw<RawCbcPolicyRateRow[]>`
    SELECT effective_date, discount_rate, collateral_accommodation_rate, unsecured_accommodation_rate
    FROM "export"."cbc_policy_rate" ORDER BY effective_date ASC
  `;
