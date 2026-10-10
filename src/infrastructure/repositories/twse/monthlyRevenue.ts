import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { MonthlyRevenueEntry, MonthlyRevenueHistoryResult, MonthlyRevenuePort } from '@/application/ports/monthlyRevenue';
import type { CompanyMonthlyRevenue } from '@/domain/industry/sectorAggregates';

// twse-ts export.monthly_revenue（PROD）——2026-09-23 從 DEV 庫換過來。先前接 DEV 是因為當時只有那邊
// 有一次性回填的樣本（356 筆 / 297 家，而且 2330 以外多半只有一兩個月），實際效果是
// GET /companies/monthly-revenue-history 幾乎只有 2330 回得出東西（web-nuxt 實測 1101、2317 都是空陣列）。
// twse-ts 2026-09-23 完成上市全市場 `_L` 回填後 PROD 有 2021-09~2026-08 共 60 個月、58,024 筆、993 家
// （964 家有 ≥36 個月），欄位也齊全，所以改讀 PROD。
//
// **必須篩 source**：這張表兩個來源共用（`MONTHLY_REVENUE` 上市；`MONTHLY_REVENUE_PUBLIC` 公開發行未上市的
// 證券商，2026-07 起 588 筆 / 301 家）。不篩會冒出 000104 這類六碼代號的非上市公司——跟 company_profile
// 那次是同一類陷阱（見 exchange/companyProfile.ts 的 LISTED_ONLY）。
//
// 已知資料特性（twse-ts 2026-09-23 說明，不要「修」掉）：`yoy_change_percent` 有 226 筆 null（0.4%），
// 是當年新上市、沒有去年同期可比，不是漏抓——照實傳 null，不要填 0，下游要靠它分辨「無法計算」與「尚無資料」。
// 金額單位是**千元**（來源原樣），這一層不換算。
//
// **上市查無資料就退回上櫃**（2026-09-23 同日補上）：tpex-ts 完成上櫃 60 個月回填後，
// export.monthly_revenue 有 2021-09~2026-08、894 個代號、50,132 筆（831 個有 ≥36 個月）。
// 在那之前這支只查 twse，所以 6488 環球晶、5483 中美晶這類上櫃公司一律回空陣列——實測確認過。
// 一家公司只會是上市或上櫃其中之一，所以「先查上市、空了再查上櫃」不會重複也不會衝突。
//
// **上櫃那張不要篩 source**（tpex-ts 2026-09-23 特別提醒）：他們的 source 語意跟 twse 不同——
// twse 的是排除「公開發行未上市」的證券商，tpex 的是區分兩份 MOPS 報表（`TPEX_T187AP05` 每日排程、
// `MOPS_T21SC03` 這次補的歷史），**兩種值都是正牌上櫃公司**。重疊月份他們以 t187ap05_O 為準、
// 只補 t21sc03 獨有的代號，所以無條件查就對了。
// 數字對不上時的權威順序（mops-ts 提供）：逐家申報的 t05st10_ifrs > t187ap05 > t21sc03（二次彙總）。
//
// **上櫃歷史列的 report_date 幾乎都是 NULL**：t21sc03 頁面的「出表日期」是 MOPS 重新產生該頁面的日期
// （2021-09 那份寫的是 2026-09-21），不是當年申報日，tpex-ts 選擇誠實留空而不是照抄。我們的 DTO 本來
// 就允許 reportDate 為 null，不用特別處理，但下游畫「申報日」時要知道上櫃歷史沒有這個資訊。
//
// 查無資料回傳空陣列，是正常情境不是錯誤，呼叫端不用特別判斷。
// DTO 型別 2026-09-17 Phase 4 搬到 application/ports/monthlyRevenue.ts（對外回應的 zod schema 在
// http/modules/companies/types.ts），這裡 re-export 給既有 import 路徑。
export type { MonthlyRevenueHistoryResult };

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

// 2026-10-11 twse、tpex 都已上詞彙表新欄名（PRD）：改讀新名稱，別名回舊名讓下游型別不動。上市篩選改用 market='sii'（source 只代表出處）。
const COLUMNS =
  'year_month, generated_date AS report_date, sector_name AS industry, current_month_revenue, last_year_same_month_revenue, yoy_change_pct AS yoy_change_percent, cumulative_revenue, cumulative_last_year_revenue, cumulative_change_pct AS cumulative_change_percent, note';

// 2026-10-10 mops-ts export.market_monthly_revenue（MOPS t21sc03 彙總表，上市＋上櫃，2016-01 起、含 -KY）補交易所缺的月份。
// 使用者 10/10 核准：twse-ts／tpex-ts 不往前補 2021-09 以前，改由 mops-ts 破例抓 MOPS 並開表。
// - **逐家逐月以交易所為準，mops 只補交易所沒有的 (symbol, year_month)**。重疊的 108,249 列實測只有 2 列當月營收不同
//   （4304、3631 的 2026-07，疑似更正申報）。
// - 補進來的不只 2021-09 以前：交易所月營收實測缺 124 家（多為 -KY），共 6,752 列近期月份。mops-ts 指出 t21sc03 的國外公司
//   在另一個 _1 頁面，交易所只抓了 _0。
// - mops 不存變動率（他們的規則：export 只做投影），年增率與累計年增率在這裡照交易所口徑算：去年同期 > 0 才算、兩位小數。
//   公告日、類股名稱 mops 沒有，給 null。
// - **倖存者偏差**（mops-ts 實測，MOPS 本身的限制）：MOPS 用「當下的公司名單」重新產生歷史頁面，已下市公司在所有歷史月份都不見。
//   早期月份只會有「現在還在的公司」。
const MOPS_COLUMNS = `year_month, NULL::date AS report_date, NULL::text AS industry, current_month_revenue, last_year_same_month_revenue,
  CASE WHEN last_year_same_month_revenue > 0 THEN round((current_month_revenue - last_year_same_month_revenue) * 100.0 / last_year_same_month_revenue, 2) END AS yoy_change_percent,
  cumulative_revenue, cumulative_last_year_revenue,
  CASE WHEN cumulative_last_year_revenue > 0 THEN round((cumulative_revenue - cumulative_last_year_revenue) * 100.0 / cumulative_last_year_revenue, 2) END AS cumulative_change_percent,
  note`;

const yearMonthKey = (row: { year_month: Date }): string => toYearMonthString(row.year_month);
const fillMissingMonths = <T extends { year_month: Date }>(primary: T[], fallback: T[]): T[] => {
  const have = new Set(primary.map(yearMonthKey));
  return [...primary, ...fallback.filter((r) => !have.has(yearMonthKey(r)))].sort((a, b) => a.year_month.getTime() - b.year_month.getTime());
};

export const getMonthlyRevenueHistory = async (symbol: string, limit: number): Promise<MonthlyRevenueHistoryResult> => {
  const [listed, mops] = await Promise.all([
    twseExportPrisma.$queryRawUnsafe<RawMonthlyRevenueRow[]>(
      `SELECT ${COLUMNS} FROM "export"."v_monthly_revenues" WHERE symbol = $1 AND market = 'sii' ORDER BY year_month ASC`,
      symbol
    ),
    mopsExportPrisma.$queryRawUnsafe<RawMonthlyRevenueRow[]>(`SELECT ${MOPS_COLUMNS} FROM "export"."market_monthly_revenue" WHERE symbol = $1`, symbol),
  ]);
  const exchange =
    listed.length > 0
      ? listed
      : await tpexExportPrisma.$queryRawUnsafe<RawMonthlyRevenueRow[]>(
          `SELECT ${COLUMNS} FROM "export"."v_monthly_revenues" WHERE symbol = $1 ORDER BY year_month ASC`,
          symbol
        );
  const rows = fillMissingMonths(exchange, mops);

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

    const momChangePct =
      currentMonthRevenue !== null && prevRevenue !== null && prevRevenue !== 0n ? round2((Number(currentMonthRevenue - prevRevenue) / Number(prevRevenue)) * 100) : null;

    return {
      yearMonth,
      generatedDate: toDateString(row.report_date),
      sectorName: row.industry,
      currentMonthRevenue: currentMonthRevenue === null ? null : currentMonthRevenue.toString(),
      lastYearSameMonthRevenue: row.last_year_same_month_revenue === null ? null : row.last_year_same_month_revenue.toString(),
      yoyChangePct: toDecimalNumber(row.yoy_change_percent),
      momChangePct,
      cumulativeRevenue: row.cumulative_revenue === null ? null : row.cumulative_revenue.toString(),
      cumulativeLastYearRevenue: row.cumulative_last_year_revenue === null ? null : row.cumulative_last_year_revenue.toString(),
      cumulativeChangePct: toDecimalNumber(row.cumulative_change_percent),
      note: row.note,
    };
  });

  return { entries, total, hasMore: total > entries.length };
};

// 2026-10-09 類股月營收彙總：一次撈一批公司（半導體約 200 家 × 60 個月），上市、上櫃、mops 各查一次。
// 「上市有資料就只用上市」跟 getMonthlyRevenueHistory 同一條規則（上櫃那張一樣不篩 source）；
// 10/10 起 mops 補交易所沒有的 (symbol, year_month)，規則同上。
type RawSymbolMonthRow = { symbol: string; year_month: Date; current_month_revenue: bigint | null; last_year_same_month_revenue: bigint | null };
const SYMBOL_MONTH_COLUMNS = 'symbol, year_month, current_month_revenue, last_year_same_month_revenue';

const listMonthlyRevenueForSymbols = async (symbols: string[]): Promise<CompanyMonthlyRevenue[]> => {
  if (symbols.length === 0) return [];
  const [listed, otc, mops] = await Promise.all([
    twseExportPrisma.$queryRawUnsafe<RawSymbolMonthRow[]>(`SELECT ${SYMBOL_MONTH_COLUMNS} FROM "export"."v_monthly_revenues" WHERE symbol = ANY($1::text[]) AND market = 'sii'`, symbols),
    tpexExportPrisma.$queryRawUnsafe<RawSymbolMonthRow[]>(`SELECT ${SYMBOL_MONTH_COLUMNS} FROM "export"."v_monthly_revenues" WHERE symbol = ANY($1::text[])`, symbols),
    mopsExportPrisma.$queryRawUnsafe<RawSymbolMonthRow[]>(`SELECT ${SYMBOL_MONTH_COLUMNS} FROM "export"."market_monthly_revenue" WHERE symbol = ANY($1::text[])`, symbols),
  ]);
  const listedSymbols = new Set(listed.map((r) => r.symbol));
  const exchange = [...listed, ...otc.filter((r) => !listedSymbols.has(r.symbol))];
  const have = new Set(exchange.map((r) => `${r.symbol}|${yearMonthKey(r)}`));
  return [...exchange, ...mops.filter((r) => !have.has(`${r.symbol}|${yearMonthKey(r)}`))].map((r) => ({
    symbol: r.symbol,
    yearMonth: toYearMonthString(r.year_month),
    currentMonthRevenue: r.current_month_revenue,
    lastYearSameMonthRevenue: r.last_year_same_month_revenue,
  }));
};

// application/ports/monthlyRevenue.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const twseDevMonthlyRevenue: MonthlyRevenuePort = { getMonthlyRevenueHistory, listMonthlyRevenueForSymbols };
