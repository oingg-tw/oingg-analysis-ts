import type { MacroDataPort } from '@/application/ports/macroData';
import { getLatestGovBondYield10yRow, listAllGovBondYields10yAsc } from '../gov/govBondYield';
import { listAllTaiexDailyPricesAsc } from '../twse/taiexIndex';
import { upsertEquityRiskPremiumResult } from '../analysis/equityRiskPremiumCache';

// application/ports/macroData.ts 的實作——三個資料庫（gov/twse/analysis）的查詢綁到同一個 port，
// Decimal → number 的轉換（以前散在 application/macro/* 的 Number(row.yield_rate)/Number(row.close)）
// 在這裡做，application 收到的是乾淨的 number。
export const macroData: MacroDataPort = {
  listGovBondYields10yAsc: async () => (await listAllGovBondYields10yAsc()).map((row) => ({ year: row.year, month: row.month, yieldRate: Number(row.yield_rate) })),
  getLatestGovBondYield10y: async () => {
    const row = await getLatestGovBondYield10yRow();
    return row ? { year: row.year, month: row.month, yieldRate: Number(row.yield_rate) } : null;
  },
  listTaiexDailyClosesAsc: async () => (await listAllTaiexDailyPricesAsc()).map((row) => ({ tradeDate: row.trade_date, close: row.close === null ? null : Number(row.close) })),
  saveEquityRiskPremiumResult: upsertEquityRiskPremiumResult,
};
