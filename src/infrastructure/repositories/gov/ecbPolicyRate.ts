import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';

// gov-ts 的歐洲央行三大政策利率歷次調整事件（export.ecb_policy_rate，2026-09-29 開，1999-01-01 起）——來源是 ECB Data Portal
// SDMX（不是 FRED：ECBMRRFR 把 2000-06-28～2008-10-14 變動利率標售期間填成字面 0.00，跟 2016～2022 真的 0% 分不出來）。
// 一列＝四個欄位（三個利率＋標售機制旗標）任一變動的生效日；numeric 百分比，可為負（存款機制利率 2014-06～2022-07）。
export interface RawEcbPolicyRateRow {
  effective_date: Date;
  deposit_facility_rate: unknown;
  main_refinancing_rate: unknown;
  marginal_lending_rate: unknown;
  main_refinancing_is_minimum_bid: boolean;
}

// 全部歷史，依生效日升冪（application 要跟前一列相減算調整幅度）。
export const listAllEcbPolicyRatesAsc = (): Promise<RawEcbPolicyRateRow[]> =>
  govExportPrisma.$queryRaw<RawEcbPolicyRateRow[]>`
    SELECT effective_date, deposit_facility_rate, main_refinancing_rate, marginal_lending_rate, main_refinancing_is_minimum_bid
    FROM "export"."ecb_policy_rate" ORDER BY effective_date ASC
  `;
