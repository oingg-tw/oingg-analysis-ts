import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getTwseNonKyCompanySymbolSet, getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { Prisma } from '../../../../../generated/tpex-export-client';
import type { RankingMetric, RankingQuery, RankingResult, RankingRow } from './types';

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

// 上市（TWSE）用型別安全的 Prisma API 查——2026-08-30 接上 TPEx 之前，這支端點雖然文件上寫
// 「全市場」，實際上只查了 TWSE，漏掉整個上櫃市場（bff-ts 實測 TWSE ~870-1080 檔、TPEx
// ~670-890 檔）。先抓 limit 筆再合併重排，不是抓完全部再排序——TWSE/TPEx 個別的前 limit 名
// 已經足夠湊出合併後真正的前 limit 名（標準的「合併 k 個已排序列表取前 N 名」作法，見
// calculateRanking 合併邏輯）。
//
// 2026-09-01 應使用者要求排除 ETF/衍生性商品；2026-09-02 再加上排除 KY 股（境外註冊掛牌
// 公司）：symbol 過濾要放進查詢本身（WHERE symbol IN (...)），不能等查完再篩掉——不然
// take: limit 抓到的前 limit 筆可能一半是 ETF/KY 股，篩完剩不到 limit 筆，讓合併後的排行
// 漏掉本來排得進來的真公司，見 getTwseNonKyCompanySymbolSet 的說明。
const queryTwseMarket = async (
  tradeDate: Date,
  metric: RankingMetric,
  order: 'asc' | 'desc',
  limit: number,
  excludeNonPositive: boolean,
  companySymbols: Set<string>
): Promise<MarketQueryResult> => {
  const symbolFilter = { in: [...companySymbols] };
  const where = excludeNonPositive ? { tradeDate, symbol: symbolFilter, [metric]: { gt: 0 } } : { tradeDate, symbol: symbolFilter, [metric]: { not: null } };

  const [rows, excludedNonPositiveCount] = await Promise.all([
    twsePrisma.dailyValuation.findMany({
      where,
      orderBy: { [metric]: order },
      take: limit,
      select: { symbol: true, peRatio: true, pbRatio: true, dividendYield: true },
    }),
    excludeNonPositive ? twsePrisma.dailyValuation.count({ where: { tradeDate, symbol: symbolFilter, [metric]: { lte: 0 } } }) : Promise.resolve(0),
  ]);

  return {
    rows: rows.map((row) => ({ symbol: row.symbol, value: Number(row[metric]) })),
    excludedNonPositiveCount,
  };
};

// 上櫃（TPEx）2026-09-01 改走 export.daily_valuation（tpexExportPrisma，取代讀 tpex-ts dev
// 環境的舊帳號）——這張 view 沒有唯一識別欄位，Prisma Client 不會產生 model 存取子，用
// $queryRaw，跟 TWSE 那邊查詢邏輯對等（欄位定義完全一樣，只是換一種查詢方式）。metric 是
// 動態欄位名稱，只會是 METRIC_COLUMNS 白名單裡的三個值，不會有使用者輸入直接拼進 SQL。
const METRIC_COLUMNS: Record<RankingMetric, string> = {
  peRatio: 'pe_ratio',
  pbRatio: 'pb_ratio',
  dividendYield: 'dividend_yield',
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

const getLatestValuationDate = async (): Promise<Date | null> => {
  const [twseLatest, tpexLatestRows] = await Promise.all([
    twsePrisma.dailyValuation.findFirst({ orderBy: { tradeDate: 'desc' }, select: { tradeDate: true } }),
    tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."daily_valuation" ORDER BY trade_date DESC LIMIT 1`,
  ]);
  const dates = [twseLatest?.tradeDate, tpexLatestRows[0]?.trade_date].filter((d): d is Date => d !== undefined);
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (d > latest ? d : latest));
};

export const calculateRanking = async (query: RankingQuery): Promise<RankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [
    'peRatio/pbRatio/dividendYield 直接來自 oingg-twse（上市）/oingg-tpex（上櫃）的 daily_valuation，本服務沒有自己重算，見 valuation/marketRatios/ 的說明。',
  ];

  const tradeDate = query.date ? new Date(`${query.date}T00:00:00.000Z`) : await getLatestValuationDate();
  if (!tradeDate) {
    warnings.push('查無任何一天的 daily_valuation 資料，無法計算排行。');
    return { metric, order, limit, tradeDate: null, excludedNonPositiveCount: 0, rankings: [], warnings };
  }

  const excludeNonPositive = EXCLUDE_NON_POSITIVE[metric];
  const twseCompanySymbols = await getTwseNonKyCompanySymbolSet();
  const [twseResult, tpexResult] = await Promise.all([
    queryTwseMarket(tradeDate, metric, order, limit, excludeNonPositive, twseCompanySymbols),
    queryTpexMarket(tradeDate, metric, order, limit, excludeNonPositive),
  ]);

  const merged = [...twseResult.rows, ...tpexResult.rows].sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));
  const limited = merged.slice(0, limit);

  if (limited.length === 0) {
    warnings.push(`${tradeDate.toISOString().slice(0, 10)} 查無符合條件的資料，無法計算排行。`);
  }

  const companyNames = await getCompanyNamesForSymbols(limited.map((row) => row.symbol));
  const rankings: RankingRow[] = limited.map((row, index) => ({ rank: index + 1, symbol: row.symbol, companyName: companyNames.get(row.symbol) ?? null, value: row.value }));

  return {
    metric,
    order,
    limit,
    tradeDate: tradeDate.toISOString().slice(0, 10),
    excludedNonPositiveCount: twseResult.excludedNonPositiveCount + tpexResult.excludedNonPositiveCount,
    rankings,
    warnings,
  };
};
