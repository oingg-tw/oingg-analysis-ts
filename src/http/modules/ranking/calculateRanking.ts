import { getSecuritySymbolSet, getCompanyNamesForSymbols } from '@/infrastructure/repositories/exchange/companyProfile';
import {
  resolveLatestValuationTradeDate,
  queryTwseValuationRanking,
  queryTpexValuationRanking,
  type ValuationRankingQueryResult,
} from '@/infrastructure/repositories/exchange/dailyValuationRanking';
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

// 上市（TWSE）——2026-08-30 接上 TPEx 之前，這支端點雖然文件上寫「全市場」，實際上只查了
// TWSE，漏掉整個上櫃市場（bff-ts 實測 TWSE ~870-1080 檔、TPEx ~670-890 檔）。先抓 limit 筆
// 再合併重排，不是抓完全部再排序——TWSE/TPEx 個別的前 limit 名已經足夠湊出合併後真正的前
// limit 名（標準的「合併 k 個已排序列表取前 N 名」作法，見 calculateRanking 合併邏輯）。
//
// 2026-09-01 應使用者要求排除 ETF/衍生性商品；2026-09-02 再加上排除 KY 股（境外註冊掛牌
// 公司）：symbol 過濾要放進查詢本身，不能等查完再篩掉（見 dailyValuationRanking.ts）。
// excludeKy: true 是這支端點特有的政策，preferredStock: 'exclude' 維持這支排行原本的行為。
//
// 2026-09-17 重構 Phase 2：daily_valuation 的 raw SQL 搬到 infrastructure/repositories/exchange/
// dailyValuationRanking.ts，這裡只留 zod schema 跟「兩個市場各自解析交易日 → 合併 → 警語」的編排。
const EMPTY_MARKET_RESULT: ValuationRankingQueryResult = { rows: [], excludedNonPositiveCount: 0 };

export const calculateRanking = async (query: RankingQuery): Promise<RankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [
    'peRatio/pbRatio/dividendYield 直接來自 oingg-twse（上市）/oingg-tpex（上櫃）的 daily_valuation，本服務沒有自己重算，見 valuation/marketRatios/ 的說明。',
  ];

  // 有指定 date 時，兩邊各自找「該日期或之前最近」的交易日，不是強制剛好等於這一天——跟本服務
  // 其他 asOfDate 查詢同一種容錯方式（例如週末/國定假日不是交易日）。2026-09-04 起兩邊各自解析
  // 自己的交易日（export 資料新鮮度不保證同步，實測過差到 5 天），日期不一樣時在 warnings 明講。
  const referenceDate = query.date ? new Date(`${query.date}T00:00:00.000Z`) : null;
  const [twseTradeDate, tpexTradeDate] = await Promise.all([resolveLatestValuationTradeDate('TWSE', referenceDate), resolveLatestValuationTradeDate('TPEx', referenceDate)]);

  if (!twseTradeDate && !tpexTradeDate) {
    warnings.push('查無任何一天的 daily_valuation 資料，無法計算排行。');
    return { metric, order, limit, tradeDate: null, excludedNonPositiveCount: 0, rankings: [], warnings };
  }

  const excludeNonPositive = EXCLUDE_NON_POSITIVE[metric];
  const twseCompanySymbols = twseTradeDate ? await getSecuritySymbolSet({ market: 'TWSE', excludeKy: true, preferredStock: 'exclude' }) : new Set<string>();
  const [twseResult, tpexResult] = await Promise.all([
    twseTradeDate ? queryTwseValuationRanking(twseTradeDate, metric, order, limit, excludeNonPositive, twseCompanySymbols) : Promise.resolve(EMPTY_MARKET_RESULT),
    tpexTradeDate ? queryTpexValuationRanking(tpexTradeDate, metric, order, limit, excludeNonPositive) : Promise.resolve(EMPTY_MARKET_RESULT),
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
