import { Prisma } from '#generated/gov-export-client';
import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';
import type { MacroSeriesPort, UsdTwdInterval } from '@/application/ports/macroData';

// 2026-09-22 總經特區：gov-ts 五個總經 view（公債殖利率沿用 govBondYield.ts）的 raw SQL，一律整段歷史升冪
// （最多 8,945 筆的日匯率另外用 limit+interval），Decimal → number 在這裡做完，application 收到乾淨 DTO。
// 來源皆為央行/主計總處統計資料庫（gov-ts 排程每月 5 日重抓），本服務只讀。
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const TRUNC_UNIT: Record<Exclude<UsdTwdInterval, 'daily'>, string> = { weekly: 'week', monthly: 'month' };

export const govMacroSeries: MacroSeriesPort = {
  listBusinessCycleReferenceCyclesAsc: async () =>
    (
      await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
        SELECT cycle_no, to_char(trough_start, 'YYYY-MM') AS trough_start, to_char(peak, 'YYYY-MM') AS peak, to_char(trough_end, 'YYYY-MM') AS trough_end,
               expansion_months, contraction_months, total_months, supplemented_fields, supplement_source
        FROM "export"."v_business_cycle_reference_dates" ORDER BY cycle_no ASC`
    ).map((r) => ({
      cycleNo: Number(r.cycle_no),
      troughStart: (r.trough_start as string | null) ?? null,
      peak: (r.peak as string | null) ?? null,
      troughEnd: (r.trough_end as string | null) ?? null,
      expansionMonths: num(r.expansion_months),
      contractionMonths: num(r.contraction_months),
      totalMonths: num(r.total_months),
      supplementedFields: (r.supplemented_fields as string[] | null) ?? [],
      supplementSource: (r.supplement_source as string | null) ?? null,
    })),

  listBusinessCycleIndicatorsAsc: async () =>
    (
      await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
        SELECT year, month, leading_index_composite, leading_index_detrended, coincident_index_composite, coincident_index_detrended,
               lagging_index_composite, lagging_index_detrended, signal_score, signal_light
        FROM "export"."v_monthly_business_cycle_indicators" ORDER BY year ASC, month ASC`
    ).map((r) => ({
      year: Number(r.year),
      month: Number(r.month),
      leadingIndexComposite: num(r.leading_index_composite),
      leadingIndexDetrended: num(r.leading_index_detrended),
      coincidentIndexComposite: num(r.coincident_index_composite),
      coincidentIndexDetrended: num(r.coincident_index_detrended),
      laggingIndexComposite: num(r.lagging_index_composite),
      laggingIndexDetrended: num(r.lagging_index_detrended),
      signalScore: num(r.signal_score),
      signalLight: (r.signal_light as string | null) ?? null,
    })),

  listFiveMajorBankRatesAsc: async () =>
    (
      await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
        SELECT year, month, deposit_rate_1m, deposit_rate_1y, base_lending_rate
        FROM "export"."v_monthly_five_major_bank_rates" ORDER BY year ASC, month ASC`
    ).map((r) => ({
      year: Number(r.year),
      month: Number(r.month),
      depositRate1m: num(r.deposit_rate_1m),
      depositRate1y: num(r.deposit_rate_1y),
      baseLendingRate: num(r.base_lending_rate),
    })),

  listMonetaryAggregatesAsc: async () =>
    (
      await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
        SELECT year, month, m1a_amount, m1a_yoy_pct, m1b_amount, m1b_yoy_pct, m2_amount, m2_yoy_pct
        FROM "export"."v_monthly_monetary_aggregates" ORDER BY year ASC, month ASC`
    ).map((r) => ({
      year: Number(r.year),
      month: Number(r.month),
      m1aAmount: num(r.m1a_amount),
      m1aYoyPct: num(r.m1a_yoy_pct),
      m1bAmount: num(r.m1b_amount),
      m1bYoyPct: num(r.m1b_yoy_pct),
      m2Amount: num(r.m2_amount),
      m2YoyPct: num(r.m2_yoy_pct),
    })),

  listStockMarketSummariesAsc: async () =>
    (
      await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
        SELECT year, month, listed_companies, total_par_value, total_market_value, total_trading_value, avg_daily_trading_value, avg_taiex, avg_taiex_yoy_pct
        FROM "export"."v_monthly_stock_market_summaries" ORDER BY year ASC, month ASC`
    ).map((r) => ({
      year: Number(r.year),
      month: Number(r.month),
      listedCompanies: num(r.listed_companies),
      totalParValue: num(r.total_par_value),
      totalMarketValue: num(r.total_market_value),
      totalTradingValue: num(r.total_trading_value),
      avgDailyTradingValue: num(r.avg_daily_trading_value),
      avgTaiex: num(r.avg_taiex),
      avgTaiexYoyPct: num(r.avg_taiex_yoy_pct),
    })),

  // 跟 twse/taiexIndex.ts 的 listLatestTaiexDailyPrices 同一招：weekly/monthly 用 DISTINCT ON date_trunc 取區間最後一天。
  listLatestUsdTwdRates: async (limit, interval) => {
    const rows =
      interval === 'daily'
        ? await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
            SELECT trade_date, bank_buying_rate, bank_selling_rate, interbank_closing_rate
            FROM "export"."v_daily_usd_twd_rates" ORDER BY trade_date DESC LIMIT ${limit}`
        : await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
            SELECT DISTINCT ON (date_trunc(${Prisma.raw(`'${TRUNC_UNIT[interval]}'`)}, trade_date)) trade_date, bank_buying_rate, bank_selling_rate, interbank_closing_rate
            FROM "export"."v_daily_usd_twd_rates"
            ORDER BY date_trunc(${Prisma.raw(`'${TRUNC_UNIT[interval]}'`)}, trade_date) DESC, trade_date DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      tradeDate: r.trade_date as Date,
      bankBuyingRate: num(r.bank_buying_rate),
      bankSellingRate: num(r.bank_selling_rate),
      interbankClosingRate: num(r.interbank_closing_rate),
    }));
  },

  listCpiAsc: async (category) =>
    (
      await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
        SELECT year, month, index_value, yoy_change_pct FROM "export"."v_monthly_cpis"
        WHERE category = ${category} ORDER BY year ASC, month ASC`
    ).map((r) => ({ year: Number(r.year), month: Number(r.month), indexValue: num(r.index_value), yoyChangePct: num(r.yoy_change_pct) })),

  listGdpAsc: async (category) =>
    (
      await govExportPrisma.$queryRaw<Record<string, unknown>[]>`
        SELECT year, quarter, contribution_points FROM "export"."v_quarterly_gdps"
        WHERE category = ${category} ORDER BY year ASC, quarter ASC`
    ).map((r) => ({ year: Number(r.year), quarter: Number(r.quarter), contributionPoints: num(r.contribution_points) })),
};
