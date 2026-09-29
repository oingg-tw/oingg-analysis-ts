import type { MacroDataPort } from '@/application/ports/macroData';
import { getLatestGovBondYield10yRow, listAllGovBondYields10yAsc } from '../gov/govBondYield';
import { listAllCbcPolicyRatesAsc } from '../gov/cbcPolicyRate';
import { listAllUsPolicyRatesAsc } from '../gov/usPolicyRate';
import { listAllEcbPolicyRatesAsc } from '../gov/ecbPolicyRate';
import { listAllTaiexDailyPricesAsc } from '../twse/taiexIndex';
import { upsertEquityRiskPremiumResult } from '../analysis/equityRiskPremiumCache';

// application/ports/macroData.ts 的實作——三個資料庫（gov/twse/analysis）的查詢綁到同一個 port，
// Decimal → number 的轉換（以前散在 application/macro/* 的 Number(row.yield_rate)/Number(row.close)）
// 在這裡做，application 收到的是乾淨的 number。
export const macroData: MacroDataPort = {
  listCbcPolicyRatesAsc: async () =>
    (await listAllCbcPolicyRatesAsc()).map((row) => ({
      effectiveDate: row.effective_date,
      discountRate: Number(row.discount_rate),
      collateralAccommodationRate: Number(row.collateral_accommodation_rate),
      unsecuredAccommodationRate: Number(row.unsecured_accommodation_rate),
    })),
  listUsPolicyRatesAsc: async () =>
    (await listAllUsPolicyRatesAsc()).map((row) => ({ effectiveDate: row.effective_date, targetUpper: Number(row.target_upper), targetLower: Number(row.target_lower) })),
  // 利率可能是 null：不能 Number(null)（會變 0、安靜地錯），保留 null。
  listEcbPolicyRatesAsc: async () =>
    (await listAllEcbPolicyRatesAsc()).map((row) => ({
      effectiveDate: row.effective_date,
      depositFacilityRate: row.deposit_facility_rate === null ? null : Number(row.deposit_facility_rate),
      mainRefinancingRate: row.main_refinancing_rate === null ? null : Number(row.main_refinancing_rate),
      marginalLendingRate: row.marginal_lending_rate === null ? null : Number(row.marginal_lending_rate),
      mainRefinancingIsMinimumBid: row.main_refinancing_is_minimum_bid,
    })),
  listGovBondYields10yAsc: async () => (await listAllGovBondYields10yAsc()).map((row) => ({ year: row.year, month: row.month, yieldRate: Number(row.yield_rate) })),
  getLatestGovBondYield10y: async () => {
    const row = await getLatestGovBondYield10yRow();
    return row ? { year: row.year, month: row.month, yieldRate: Number(row.yield_rate) } : null;
  },
  listTaiexDailyClosesAsc: async () => (await listAllTaiexDailyPricesAsc()).map((row) => ({ tradeDate: row.trade_date, close: row.close === null ? null : Number(row.close) })),
  saveEquityRiskPremiumResult: upsertEquityRiskPremiumResult,
};
