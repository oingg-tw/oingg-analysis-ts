import type { AppDeps } from '@/application/deps';
import type { PriceChangeRankingQuery, PriceChangeRankingResult, PriceChangeRow } from './types';

// 2026-09-17 Phase 4：從 http/modules/market/priceChangeRanking/service.ts 搬來，資料存取改走 deps，邏輯逐字不變。
export type PriceChangeRankingDeps = Pick<AppDeps, 'marketLists' | 'companyProfiles'>;

interface RawChangeRow {
  market: 'TWSE' | 'TPEx';
  symbol: string;
  tradeDate: string;
  previousTradeDate: string;
  close: number;
  previousClose: number;
  changeAmount: number;
  changePercent: number;
}

// 漲跌幅排行——2026-09-02 應使用者要求新增。twse-ts/tpex-ts 沒有現成的「漲幅前20」dataset
// （不像 volume_top20 是對方算好的），這裡用本服務已有的 daily_price（全市場收盤價鏡像）
// 自己算：比較最新交易日跟前一個交易日的收盤價，算漲跌幅。
//
// 上市（TWSE）跟上櫃（TPEx）各自查各自最新的兩個交易日，不是強迫兩邊用同一個日期——這點
// 跟本服務其他合併排行（revenue-ranking/volume-top20 等）不一樣：那些排行的合併邏輯是「取
// 兩邊較新的那個日期，兩邊都查那天」，但漲跌幅本質上要「這檔股票自己最近兩個交易日」才有
// 意義，如果強迫上櫃用上市的最新日期、剛好上市那天還沒有資料，會讓上市整個排行榜消失，不是
// 只是「少幾筆」。所以這裡每一列都帶自己的 tradeDate/previousTradeDate，兩個市場可能不同。
//
// 排除 ETF/衍生性商品——這是主打上市公司證券的排行榜功能，見
// companyProfile.ts 的 getAllSecurityRows 說明。preferredStock: 'exclude'
// 維持這支排行原本的行為。
//
// 交易日的取法（TWSE 查 daily_taiex_index、TPEx 才 DISTINCT daily_price，效能理由）見
// infrastructure/repositories/exchange/marketLists.ts 的 getLatestTwoTradeDates。
const getLatestTwoTradeDatesTwse = (deps: PriceChangeRankingDeps): Promise<[Date, Date] | null> => deps.marketLists.getLatestTwoTradeDates('TWSE');

const getLatestTwoTradeDatesTpex = (deps: PriceChangeRankingDeps): Promise<[Date, Date] | null> => deps.marketLists.getLatestTwoTradeDates('TPEx');

const computeChanges = (
  market: 'TWSE' | 'TPEx',
  tradeDate: Date,
  previousTradeDate: Date,
  todayRows: { symbol: string; close: number | null }[],
  prevRows: { symbol: string; close: number | null }[],
  companySymbols: Set<string>
): RawChangeRow[] => {
  const prevBySymbol = new Map(prevRows.map((row) => [row.symbol, row.close]));
  const changes: RawChangeRow[] = [];
  for (const row of todayRows) {
    if (!companySymbols.has(row.symbol)) continue; // ETF/衍生性商品，不是真正的公司，排除。
    if (row.close === null) continue;
    const previousClose = prevBySymbol.get(row.symbol);
    if (previousClose === undefined || previousClose === null || previousClose <= 0) continue; // 分母不能是 0 或負值。
    const close = Number(row.close);
    const previousCloseNum = Number(previousClose);
    changes.push({
      market,
      symbol: row.symbol,
      tradeDate: tradeDate.toISOString().slice(0, 10),
      previousTradeDate: previousTradeDate.toISOString().slice(0, 10),
      close,
      previousClose: previousCloseNum,
      changeAmount: Math.round((close - previousCloseNum) * 10000) / 10000,
      changePercent: Math.round(((close - previousCloseNum) / previousCloseNum) * 100 * 100) / 100,
    });
  }
  return changes;
};

export const calculatePriceChangeRanking = async (query: PriceChangeRankingQuery, deps: PriceChangeRankingDeps): Promise<PriceChangeRankingResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const [twseDates, tpexDates] = await Promise.all([getLatestTwoTradeDatesTwse(deps), getLatestTwoTradeDatesTpex(deps)]);
  if (!twseDates) warnings.push('twse daily_price 資料不足兩個交易日，無法計算上市個股漲跌幅。');
  if (!tpexDates) warnings.push('tpex daily_price 資料不足兩個交易日，無法計算上櫃個股漲跌幅。');

  const pool: RawChangeRow[] = [];

  if (twseDates) {
    const [tradeDate, previousTradeDate] = twseDates;
    const [todayRows, prevRows, companySymbols] = await Promise.all([
      deps.marketLists.listClosesForDate('TWSE', tradeDate),
      deps.marketLists.listClosesForDate('TWSE', previousTradeDate),
      deps.companyProfiles.getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
    ]);
    pool.push(
      ...computeChanges(
        'TWSE',
        tradeDate,
        previousTradeDate,
        todayRows.map((r) => ({ symbol: r.symbol, close: r.close === null ? null : Number(r.close) })),
        prevRows.map((r) => ({ symbol: r.symbol, close: r.close === null ? null : Number(r.close) })),
        companySymbols
      )
    );
  }

  if (tpexDates) {
    const [tradeDate, previousTradeDate] = tpexDates;
    const [todayRows, prevRows, companySymbols] = await Promise.all([
      deps.marketLists.listClosesForDate('TPEx', tradeDate),
      deps.marketLists.listClosesForDate('TPEx', previousTradeDate),
      deps.companyProfiles.getSecuritySymbolSet({ market: 'TPEx', preferredStock: 'exclude' }),
    ]);
    pool.push(
      ...computeChanges(
        'TPEx',
        tradeDate,
        previousTradeDate,
        todayRows.map((r) => ({ symbol: r.symbol, close: r.close === null ? null : Number(r.close) })),
        prevRows.map((r) => ({ symbol: r.symbol, close: r.close === null ? null : Number(r.close) })),
        companySymbols
      )
    );
  }

  if (pool.length === 0) {
    warnings.push('查無任何可計算漲跌幅的公司。');
  }

  const gainers = [...pool].sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
  const losers = [...pool].sort((a, b) => a.changePercent - b.changePercent).slice(0, limit);

  const companyNames = await deps.companyProfiles.getCompanyNamesForSymbols([...new Set([...gainers, ...losers].map((row) => row.symbol))]);
  const toRow = (row: RawChangeRow, index: number): PriceChangeRow => ({
    rank: index + 1,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
    tradeDate: row.tradeDate,
    previousTradeDate: row.previousTradeDate,
    close: row.close,
    previousClose: row.previousClose,
    changeAmount: row.changeAmount,
    changePercent: row.changePercent,
  });

  return {
    limit,
    gainers: gainers.map(toRow),
    losers: losers.map(toRow),
    warnings,
  };
};
