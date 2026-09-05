import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet, getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { Prisma } from '#generated/tpex-export-client';
import { Prisma as TwsePrisma } from '#generated/twse-export-client';
import { z } from 'zod';

export const rankingMetricSchema = z.enum(['peRatio', 'pbRatio', 'dividendYield']);
export type RankingMetric = z.infer<typeof rankingMetricSchema>;

export const rankingOrderSchema = z.enum(['asc', 'desc']);
export type RankingOrder = z.infer<typeof rankingOrderSchema>;

export const rankingQuerySchema = z.object({
  metric: rankingMetricSchema,
  order: rankingOrderSchema,
  limit: z.number(),
  date: z.string().optional().meta({ description: '選填，格式 YYYY-MM-DD；不給就抓 daily_valuation 目前最新一個交易日。' }),
});
export type RankingQuery = z.infer<typeof rankingQuerySchema>;

export const rankingRowSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  companyName: z.string().nullable(),
  value: z.number(),
});
export type RankingRow = z.infer<typeof rankingRowSchema>;

export const rankingResultSchema = z.object({
  metric: rankingMetricSchema,
  order: rankingOrderSchema,
  limit: z.number(),
  tradeDate: z.string().nullable().meta({ description: '實際使用的交易日；查無任何資料時為 null。' }),
  excludedNonPositiveCount: z.number().meta({
    description: 'peRatio/pbRatio 排除了 <= 0 的公司（虧損或淨值為負，不是「便宜」，是財務體質問題，混進排行會誤導），這裡記錄排除了幾家；dividendYield 沒有這個排除。',
  }),
  rankings: z.array(rankingRowSchema),
  warnings: z.array(z.string()),
});
export type RankingResult = z.infer<typeof rankingResultSchema>;

// peRatio/pbRatio <= 0 代表虧損（EPS 為負）或淨值為負，不是「便宜」，是財務體質出問題，
// 排行榜的目的是篩「便宜但體質正常」的公司，混進負值會讓「最低本益比」排行榜出現一堆
// 財務出問題的公司，不是使用者要的東西——這個排除只套用在 peRatio/pbRatio，dividendYield
// 本身沒有負值的情況（沒配息是 0，不是負的），不需要排除。
const EXCLUDE_NON_POSITIVE: Record<RankingMetric, boolean> = {
  peRatio: true,
  pbRatio: true,
  dividendYield: false,
};

interface MarketQueryResult {
  rows: { symbol: string; value: number }[];
  excludedNonPositiveCount: number;
}

// metric 是動態欄位名稱，只會是這個白名單裡的三個值，不會有使用者輸入直接拼進 SQL。
const METRIC_COLUMNS: Record<RankingMetric, string> = {
  peRatio: 'pe_ratio',
  pbRatio: 'pb_ratio',
  dividendYield: 'dividend_yield',
};

// 上市（TWSE）——2026-08-30 接上 TPEx 之前，這支端點雖然文件上寫「全市場」，實際上只查了
// TWSE，漏掉整個上櫃市場（bff-ts 實測 TWSE ~870-1080 檔、TPEx ~670-890 檔）。先抓 limit 筆
// 再合併重排，不是抓完全部再排序——TWSE/TPEx 個別的前 limit 名已經足夠湊出合併後真正的前
// limit 名（標準的「合併 k 個已排序列表取前 N 名」作法，見 calculateRanking 合併邏輯）。
//
// 2026-09-01 應使用者要求排除 ETF/衍生性商品；2026-09-02 再加上排除 KY 股（境外註冊掛牌
// 公司）：symbol 過濾要放進查詢本身，不能等查完再篩掉——不然 LIMIT 抓到的前 limit 筆可能
// 一半是 ETF/KY 股，篩完剩不到 limit 筆，讓合併後的排行漏掉本來排得進來的真公司，見
// src/shared/sourceData/companyProfile.ts 的 getAllSecurityRows 說明。excludeKy: true 是這支
// 端點特有的政策，preferredStock: 'exclude' 維持這支排行原本的行為。
//
// 2026-09-03 使用者決定 curated 中台層現階段太早，改回直接查 twseExportPrisma——這張 view
// 沒有唯一識別欄位，用 $queryRaw，跟 TPEx 那邊查詢邏輯對等（欄位定義完全一樣）。
const queryTwseMarket = async (
  tradeDate: Date,
  metric: RankingMetric,
  order: 'asc' | 'desc',
  limit: number,
  excludeNonPositive: boolean,
  companySymbols: Set<string>
): Promise<MarketQueryResult> => {
  // 注意：Prisma.sql/Prisma.raw 一定要用「跟目標 client 同一份 generated client」匯出的 Prisma
  // 命名空間——每個 generated client 各自打包一份 Prisma runtime，跨 client 混用 Prisma.sql
  // 建出來的 Sql 物件不會被目標 client 的 $queryRaw 正確識別，2026-09-03 實測過：不會報錯，
  // 但查詢會靜默回傳空結果（instanceof 檢查失敗，整包被當成別的東西處理）。
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

// 排除 ETF/衍生性商品，以及 KY 股（境外註冊掛牌公司，short_name 以「-KY」結尾，2026-09-02
// 應使用者要求）——daily_valuation 跟 company_profile 同一個資料庫（export schema），直接用
// 子查詢過濾，不用像 TWSE 那邊先把整份 symbol 清單抓進 JS 再塞進 IN(...) 參數。short_name
// IS NULL 那個分支是防呆：SQL 的 NOT LIKE 對 NULL 值一律回傳 NULL（不是 TRUE），沒有這個
// 分支會誤刪 short_name 剛好是 NULL 的公司。
const COMPANY_SYMBOL_SUBQUERY = Prisma.sql`symbol IN (SELECT symbol FROM "export"."company_profile" WHERE short_name IS NULL OR short_name NOT LIKE '%-KY%')`;

const queryTpexMarket = async (tradeDate: Date, metric: RankingMetric, order: 'asc' | 'desc', limit: number, excludeNonPositive: boolean): Promise<MarketQueryResult> => {
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

// 2026-09-04 修正：原本兩邊強迫用同一個「較新的那個市場的最新交易日」查詢——TWSE/TPEx 的
// export 資料新鮮度不保證同步（實測過差到 5 天），較舊的那個市場那天完全沒資料，會讓它整個
// 從排行榜消失，不是「少幾筆」，且沒有任何警訊。改成兩邊各自解析自己的「最新（或指定日期
// 之前最近）交易日」，跟本服務其他 asOfDate 語意（見 marketCap.ts/priceSeries.ts）一致；兩邊
// 實際查到的日期不一樣時，在 warnings 裡明講，不要讓使用者誤以為排行是同一天的比較。
const resolveTwseTradeDate = async (referenceDate: Date | null): Promise<Date | null> => {
  const rows = referenceDate
    ? await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" WHERE trade_date <= ${referenceDate} ORDER BY trade_date DESC LIMIT 1`
    : await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" ORDER BY trade_date DESC LIMIT 1`;
  return rows[0]?.trade_date ?? null;
};

const resolveTpexTradeDate = async (referenceDate: Date | null): Promise<Date | null> => {
  const rows = referenceDate
    ? await tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" WHERE trade_date <= ${referenceDate} ORDER BY trade_date DESC LIMIT 1`
    : await tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" ORDER BY trade_date DESC LIMIT 1`;
  return rows[0]?.trade_date ?? null;
};

const EMPTY_MARKET_RESULT: MarketQueryResult = { rows: [], excludedNonPositiveCount: 0 };

export const calculateRanking = async (query: RankingQuery): Promise<RankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [
    'peRatio/pbRatio/dividendYield 直接來自 oingg-twse（上市）/oingg-tpex（上櫃）的 daily_valuation，本服務沒有自己重算，見 valuation/marketRatios/ 的說明。',
  ];

  // 有指定 date 時，兩邊各自找「該日期或之前最近」的交易日，不是強制剛好等於這一天——跟本服務
  // 其他 asOfDate 查詢同一種容錯方式（例如週末/國定假日不是交易日）。
  const referenceDate = query.date ? new Date(`${query.date}T00:00:00.000Z`) : null;
  const [twseTradeDate, tpexTradeDate] = await Promise.all([resolveTwseTradeDate(referenceDate), resolveTpexTradeDate(referenceDate)]);

  if (!twseTradeDate && !tpexTradeDate) {
    warnings.push('查無任何一天的 daily_valuation 資料，無法計算排行。');
    return { metric, order, limit, tradeDate: null, excludedNonPositiveCount: 0, rankings: [], warnings };
  }

  const excludeNonPositive = EXCLUDE_NON_POSITIVE[metric];
  const twseCompanySymbols = twseTradeDate ? await getSecuritySymbolSet({ market: 'TWSE', excludeKy: true, preferredStock: 'exclude' }) : new Set<string>();
  const [twseResult, tpexResult] = await Promise.all([
    twseTradeDate ? queryTwseMarket(twseTradeDate, metric, order, limit, excludeNonPositive, twseCompanySymbols) : Promise.resolve(EMPTY_MARKET_RESULT),
    tpexTradeDate ? queryTpexMarket(tpexTradeDate, metric, order, limit, excludeNonPositive) : Promise.resolve(EMPTY_MARKET_RESULT),
  ]);

  const resolvedDates = [twseTradeDate, tpexTradeDate].filter((d): d is Date => d !== null);
  const latestDate = resolvedDates.reduce((latest, d) => (d > latest ? d : latest));
  if (twseTradeDate && tpexTradeDate && twseTradeDate.getTime() !== tpexTradeDate.getTime()) {
    warnings.push(
      `上市（TWSE）跟上櫃（TPEx）目前不是同一個最新交易日——上市 ${twseTradeDate.toISOString().slice(0, 10)}、上櫃 ${tpexTradeDate.toISOString().slice(0, 10)}，兩邊各自用自己最新的交易日排行，不是同一天的比較。`
    );
  } else if (!twseTradeDate) {
    warnings.push('上市（TWSE）查無交易日資料，這次排行只有上櫃（TPEx）的公司。');
  } else if (!tpexTradeDate) {
    warnings.push('上櫃（TPEx）查無交易日資料，這次排行只有上市（TWSE）的公司。');
  }

  const merged = [...twseResult.rows, ...tpexResult.rows].sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));
  const limited = merged.slice(0, limit);

  if (limited.length === 0) {
    warnings.push(`${latestDate.toISOString().slice(0, 10)} 查無符合條件的資料，無法計算排行。`);
  }

  const companyNames = await getCompanyNamesForSymbols(limited.map((row) => row.symbol));
  const rankings: RankingRow[] = limited.map((row, index) => ({ rank: index + 1, symbol: row.symbol, companyName: companyNames.get(row.symbol) ?? null, value: row.value }));

  return {
    metric,
    order,
    limit,
    tradeDate: latestDate.toISOString().slice(0, 10),
    excludedNonPositiveCount: twseResult.excludedNonPositiveCount + tpexResult.excludedNonPositiveCount,
    rankings,
    warnings,
  };
};
