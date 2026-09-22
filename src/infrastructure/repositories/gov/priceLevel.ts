import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';
import type { PriceLevelPort } from '@/application/ports/priceLevel';

// Ohlson SIZE 換算用的兩個 gov-ts view（見 application/ports/priceLevel.ts）：
// - export.daily_usd_twd_rate（CBC EG51D01en，1992-01-04 起）：取 asOf 當天或之前最近一筆的 interbank_closing_rate。
// - export.quarterly_us_gnp_deflator（FRED GNPDEF，1947Q1 起，2017=100，gov-ts 2026-09-22 開）：year/quarter 主鍵。
// 1968 基期平均每個 process 只查一次（四筆固定歷史值，FRED 修正不會動到 1968）。
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

let base1968: Promise<number | null> | null = null;

export const govPriceLevel: PriceLevelPort = {
  getUsdTwdRateAsOf: async (asOf) => {
    const rows = await govExportPrisma.$queryRaw<{ interbank_closing_rate: unknown }[]>`
      SELECT interbank_closing_rate FROM "export"."daily_usd_twd_rate"
      WHERE trade_date <= ${asOf} AND interbank_closing_rate IS NOT NULL
      ORDER BY trade_date DESC LIMIT 1`;
    return num(rows[0]?.interbank_closing_rate);
  },
  getUsGnpDeflator: async (year, quarter) => {
    const rows = await govExportPrisma.$queryRaw<{ index_value: unknown }[]>`
      SELECT index_value FROM "export"."quarterly_us_gnp_deflator" WHERE year = ${year} AND quarter = ${quarter}`;
    return num(rows[0]?.index_value);
  },
  getUsGnpDeflatorBase1968: () => {
    base1968 ??= govExportPrisma
      .$queryRaw<{ avg: unknown }[]>`SELECT avg(index_value) AS avg FROM "export"."quarterly_us_gnp_deflator" WHERE year = 1968`
      .then((rows) => num(rows[0]?.avg))
      .catch((error: unknown) => {
        base1968 = null;
        throw error;
      });
    return base1968;
  },
};
