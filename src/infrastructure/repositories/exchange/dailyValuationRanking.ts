import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import type { ValuationRankingPort } from '@/application/ports/valuationRanking';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { Prisma } from '#generated/tpex-export-client';
import { Prisma as TwsePrisma } from '#generated/twse-export-client';
import type { Market } from './marketLists';

// 估值排行（GET /valuation/ranking）查 daily_valuation 的 raw SQL——2026-09-17 重構 Phase 2 從
// http/modules/ranking/calculateRanking.ts 搬來（逐字），那邊只留 zod schema 跟合併/警語的編排。
//
// 注意：Prisma.sql/Prisma.raw 一定要用「跟目標 client 同一份 generated client」匯出的 Prisma
// 命名空間——每個 generated client 各自打包一份 Prisma runtime，跨 client 混用 Prisma.sql
// 建出來的 Sql 物件不會被目標 client 的 $queryRaw 正確識別，2026-09-03 實測過：不會報錯，
// 但查詢會靜默回傳空結果（instanceof 檢查失敗，整包被當成別的東西處理）。

export type ValuationRankingMetric = 'peRatio' | 'pbRatio' | 'dividendYield';

// metric 是動態欄位名稱，只會是這個白名單裡的三個值，不會有使用者輸入直接拼進 SQL。
const METRIC_COLUMNS: Record<ValuationRankingMetric, string> = {
  peRatio: 'pe_ratio',
  pbRatio: 'pb_ratio',
  dividendYield: 'dividend_yield',
};

export interface ValuationRankingQueryResult {
  rows: { symbol: string; value: number }[];
  excludedNonPositiveCount: number;
}

// 兩邊各自解析自己的「最新（或指定日期之前最近）交易日」——TWSE/TPEx 的 export 資料新鮮度不保證
// 同步（實測過差到 5 天），強迫用同一天會讓較舊的那個市場整個從排行榜消失。
export const resolveLatestValuationTradeDate = async (market: Market, referenceDate: Date | null): Promise<Date | null> => {
  if (market === 'TWSE') {
    const rows = referenceDate
      ? await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" WHERE trade_date <= ${referenceDate} ORDER BY trade_date DESC LIMIT 1`
      : await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" ORDER BY trade_date DESC LIMIT 1`;
    return rows[0]?.trade_date ?? null;
  }
  const rows = referenceDate
    ? await tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" WHERE trade_date <= ${referenceDate} ORDER BY trade_date DESC LIMIT 1`
    : await tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" ORDER BY trade_date DESC LIMIT 1`;
  return rows[0]?.trade_date ?? null;
};

// 上市：symbol 過濾要放進查詢本身（呼叫端先用 getSecuritySymbolSet 排除 ETF/衍生性商品/KY 股），
// 不能等查完再篩——不然 LIMIT 抓到的前 limit 筆可能一半是 ETF/KY 股，篩完剩不到 limit 筆。
// twseExportPrisma 是實體隔離的獨立 Neon 專案，沒辦法像 TPEx 那樣在 SQL 裡子查詢 company_profile。
export const queryTwseValuationRanking = async (
  tradeDate: Date,
  metric: ValuationRankingMetric,
  order: 'asc' | 'desc',
  limit: number,
  excludeNonPositive: boolean,
  companySymbols: Set<string>
): Promise<ValuationRankingQueryResult> => {
  const column = TwsePrisma.raw(`"${METRIC_COLUMNS[metric]}"`);
  const directionSql = order === 'asc' ? TwsePrisma.raw('ASC') : TwsePrisma.raw('DESC');
  const filterSql = excludeNonPositive ? TwsePrisma.sql`${column} > 0` : TwsePrisma.sql`${column} IS NOT NULL`;
  const symbolArray = [...companySymbols];

  const [rows, excludedCountRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string; value: unknown }[]>(
      TwsePrisma.sql`SELECT symbol, ${column} AS value FROM "export"."daily_valuation" WHERE trade_date = ${tradeDate} AND symbol = ANY(${symbolArray}) AND ${filterSql} ORDER BY ${column} ${directionSql} LIMIT ${limit}`
    ),
    excludeNonPositive
      ? twseExportPrisma.$queryRaw<{ cnt: bigint }[]>(
          TwsePrisma.sql`SELECT count(*)::bigint as cnt FROM "export"."daily_valuation" WHERE trade_date = ${tradeDate} AND symbol = ANY(${symbolArray}) AND ${column} <= 0`
        )
      : Promise.resolve([{ cnt: 0n }]),
  ]);

  return {
    rows: rows.map((row) => ({ symbol: row.symbol, value: Number(row.value) })),
    excludedNonPositiveCount: Number(excludedCountRows[0]?.cnt ?? 0),
  };
};

// 上櫃：排除 ETF/衍生性商品，以及 KY 股（short_name 以「-KY」結尾）——daily_valuation 跟
// company_profile 同一個資料庫（export schema），直接用子查詢過濾。short_name IS NULL 那個分支
// 是防呆：SQL 的 NOT LIKE 對 NULL 值一律回傳 NULL（不是 TRUE），沒有這個分支會誤刪 short_name
// 剛好是 NULL 的公司。
const COMPANY_SYMBOL_SUBQUERY = Prisma.sql`symbol IN (SELECT symbol FROM "export"."company_profile" WHERE short_name IS NULL OR short_name NOT LIKE '%-KY%')`;

export const queryTpexValuationRanking = async (
  tradeDate: Date,
  metric: ValuationRankingMetric,
  order: 'asc' | 'desc',
  limit: number,
  excludeNonPositive: boolean
): Promise<ValuationRankingQueryResult> => {
  const column = Prisma.raw(`"${METRIC_COLUMNS[metric]}"`);
  const directionSql = order === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
  const filterSql = excludeNonPositive ? Prisma.sql`${column} > 0` : Prisma.sql`${column} IS NOT NULL`;

  const [rows, excludedCountRows] = await Promise.all([
    tpexExportPrisma.$queryRaw<{ symbol: string; value: unknown }[]>(
      Prisma.sql`SELECT symbol, ${column} AS value FROM "export"."daily_valuation" WHERE trade_date = ${tradeDate} AND ${filterSql} AND ${COMPANY_SYMBOL_SUBQUERY} ORDER BY ${column} ${directionSql} LIMIT ${limit}`
    ),
    excludeNonPositive
      ? tpexExportPrisma.$queryRaw<{ cnt: bigint }[]>(
          Prisma.sql`SELECT count(*)::bigint as cnt FROM "export"."daily_valuation" WHERE trade_date = ${tradeDate} AND ${column} <= 0 AND ${COMPANY_SYMBOL_SUBQUERY}`
        )
      : Promise.resolve([{ cnt: 0n }]),
  ]);

  return {
    rows: rows.map((row) => ({ symbol: row.symbol, value: Number(row.value) })),
    excludedNonPositiveCount: Number(excludedCountRows[0]?.cnt ?? 0),
  };
};

// application/ports/valuationRanking.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const exchangeValuationRanking: ValuationRankingPort = { resolveLatestValuationTradeDate, queryTwseValuationRanking, queryTpexValuationRanking };
