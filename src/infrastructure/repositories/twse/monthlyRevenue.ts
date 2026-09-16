import { twseExportDevPrisma } from '@/infrastructure/prisma/twseExportDevClient';
import type { MonthlyRevenueEntry, MonthlyRevenueHistoryResult, MonthlyRevenuePort } from '@/application/ports/monthlyRevenue';

// twse-ts export.monthly_revenue——目前只有 2330 有資料（一次性回填，2021-08~2026-07
// 共 60 個月，見 twseExportDevClient.ts 檔頭說明）。查無資料（不是 2330）回傳空陣列，
// 是正常情境不是錯誤，呼叫端不用特別判斷。
// DTO 型別 2026-09-17 Phase 4 搬到 application/ports/monthlyRevenue.ts（對外回應的 zod schema 在
// http/modules/companies/types.ts），這裡 re-export 給既有 import 路徑。
export type { MonthlyRevenueEntry, MonthlyRevenueHistoryResult };

interface RawMonthlyRevenueRow {
  year_month: Date;
  report_date: Date | null;
  industry: string | null;
  current_month_revenue: bigint | null;
  last_year_same_month_revenue: bigint | null;
  yoy_change_percent: unknown;
  cumulative_revenue: bigint | null;
  cumulative_last_year_revenue: bigint | null;
  cumulative_change_percent: unknown;
  note: string | null;
}

const toDecimalNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const toDateString = (value: Date | null): string | null => (value === null ? null : value.toISOString().slice(0, 10));
const toYearMonthString = (value: Date): string => value.toISOString().slice(0, 7);
const round2 = (x: number): number => Math.round(x * 100) / 100;

export const getMonthlyRevenueHistory = async (symbol: string, limit: number): Promise<MonthlyRevenueHistoryResult> => {
  const rows = await twseExportDevPrisma.$queryRaw<RawMonthlyRevenueRow[]>`
    SELECT year_month, report_date, industry, current_month_revenue, last_year_same_month_revenue,
      yoy_change_percent, cumulative_revenue, cumulative_last_year_revenue, cumulative_change_percent, note
    FROM "export"."monthly_revenue"
    WHERE symbol = ${symbol}
    ORDER BY year_month ASC
  `;

  const total = rows.length;
  const selected = rows.slice(-limit);

  // mom_change_percent/prev_month_revenue 這批一次性回填的資料全部是 null（實測過），
  // 但 current_month_revenue 逐月連續無缺月，自己用相鄰兩個月反推月增率，不依賴來源
  // 那兩個空欄位。用完整的 rows（不是切過 limit 的 selected）找上一個月，避免 limit
  // 切在中間時第一筆錯誤地被當成「沒有上個月」。
  const revenueByYearMonth = new Map(rows.map((row) => [toYearMonthString(row.year_month), row.current_month_revenue]));

  const entries: MonthlyRevenueEntry[] = selected.map((row) => {
    const yearMonth = toYearMonthString(row.year_month);
    const currentMonthRevenue = row.current_month_revenue;

    const prevDate = new Date(row.year_month);
    prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
    const prevRevenue = revenueByYearMonth.get(toYearMonthString(prevDate)) ?? null;

    const momChangePercent =
      currentMonthRevenue !== null && prevRevenue !== null && prevRevenue !== 0n ? round2((Number(currentMonthRevenue - prevRevenue) / Number(prevRevenue)) * 100) : null;

    return {
      yearMonth,
      reportDate: toDateString(row.report_date),
      industry: row.industry,
      currentMonthRevenue: currentMonthRevenue === null ? null : currentMonthRevenue.toString(),
      lastYearSameMonthRevenue: row.last_year_same_month_revenue === null ? null : row.last_year_same_month_revenue.toString(),
      yoyChangePercent: toDecimalNumber(row.yoy_change_percent),
      momChangePercent,
      cumulativeRevenue: row.cumulative_revenue === null ? null : row.cumulative_revenue.toString(),
      cumulativeLastYearRevenue: row.cumulative_last_year_revenue === null ? null : row.cumulative_last_year_revenue.toString(),
      cumulativeChangePercent: toDecimalNumber(row.cumulative_change_percent),
      note: row.note,
    };
  });

  return { entries, total, hasMore: total > entries.length };
};

// application/ports/monthlyRevenue.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const twseDevMonthlyRevenue: MonthlyRevenuePort = { getMonthlyRevenueHistory };
