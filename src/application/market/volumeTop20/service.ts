import type { AppDeps } from '@/application/deps';
import { cumulativeChangePercentKey } from '@/application/ports/priceChange';
import type { VolumeTop20Result, VolumeTop20Row } from './types';

// 2026-09-17 Phase 4：從 http/modules/market/volumeTop20/service.ts 搬來，資料存取改走 deps，邏輯逐字不變。
export type VolumeTop20Deps = Pick<AppDeps, 'marketLists' | 'companyProfiles' | 'priceChange'>;

const ONE_DAY_CHANGE_TRADING_DAYS = 1;

interface PoolRow {
  market: 'TWSE' | 'TPEx';
  symbol: string;
  volume: bigint;
  transaction: bigint | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  dir: string | null;
  change: number | null;
}

// 成交量前 20 名——twse-ts/tpex-ts 給的是「各自市場」官方算好的前 20（不是全市場原始資料），
// 2026-09-01 應使用者要求合併成真正的「全市場前 20」：把兩邊的前 20 candidate pool（共最多
// 40 筆）合併後再依成交量重排、取前 20——因為兩邊給的已經是各自市場成交量最大的前 20，
// 合併後排出來的前 20 一定涵蓋真正的全市場前 20（標準的「合併已排序列表取前 N 名」邏輯），
// 不需要重新查整個市場的原始資料。
//
// TPEx 官方排行只有 symbol/trade_date/rank/volume（張），2026-10-08 起成交量（股）、成交筆數與開高低收改從 daily_price 補上；
// dir/change 只有 TWSE 有，上櫃回 null，不是查詢失敗。
//
// ⚠️ 沒有排除 ETF/衍生性商品（跟本服務其他主打「上市公司證券」的排行榜不一樣，2026-09-01
// 應使用者要求維持原樣，直接回傳兩邊官方排名合併後的結果）。
//
// changePercent：2026-09-02 應使用者要求新增，不是用 TWSE 原生的 dir/change（那個只有 TWSE
// 有、TPEx 沒有，兩邊算法不一定一致），統一改用 daily_price 自己算的單日漲跌幅（點對點，
// tradingDaysBack=1，見 priceChange.ts），確保兩個市場算法一致；資料不足時是 null。
export const getVolumeTop20 = async (deps: VolumeTop20Deps): Promise<VolumeTop20Result> => {
  const warnings: string[] = [];

  const [twseLatest, tpexLatest] = await Promise.all([deps.marketLists.getLatestVolumeTop20TradeDate('TWSE'), deps.marketLists.getLatestVolumeTop20TradeDate('TPEx')]);
  const candidates = [twseLatest, tpexLatest].filter((d): d is Date => d != null);
  if (candidates.length === 0) {
    warnings.push('查無成交量前20名資料。');
    return { tradeDate: '', rankings: [], warnings };
  }
  const tradeDate = candidates.reduce((latest, current) => (current > latest ? current : latest));
  // 2026-10-08 修：原本兩個市場都查「較晚的那一天」，上市還沒更新到那天時整批消失、沒有警告（本機改讀上櫃 PROD 後現形：
  // 上櫃 10-07、上市 10-06，前 20 名全是上櫃）。改成跟 marginShortRatioRanking／calculateRanking 一樣各用自己最新的交易日，日期不同時加警告。
  if (twseLatest && tpexLatest && twseLatest.getTime() !== tpexLatest.getTime()) {
    warnings.push(
      `上市（TWSE）跟上櫃（TPEx）目前不是同一個最新交易日——上市 ${twseLatest.toISOString().slice(0, 10)}、上櫃 ${tpexLatest.toISOString().slice(0, 10)}，兩邊各自用自己最新的交易日排行，不是同一天的比較。`
    );
  } else if (!twseLatest) {
    warnings.push('上市（TWSE）查無成交量前20名資料，這次排行只有上櫃（TPEx）。');
  } else if (!tpexLatest) {
    warnings.push('上櫃（TPEx）查無成交量前20名資料，這次排行只有上市（TWSE）。');
  }

  // 每一列的漲跌幅用它自己市場的交易日算（兩邊日期可能不同）。
  const dateOf = (market: 'TWSE' | 'TPEx'): Date => (market === 'TWSE' ? twseLatest : tpexLatest) ?? tradeDate;
  const [twseRows, tpexRows] = await Promise.all([
    twseLatest ? deps.marketLists.listVolumeTop20Twse(twseLatest) : Promise.resolve([]),
    tpexLatest ? deps.marketLists.listVolumeTop20Tpex(tpexLatest) : Promise.resolve([]),
  ]);

  const pool: PoolRow[] = [
    ...twseRows.map((row): PoolRow => ({ market: 'TWSE', ...row })),
    ...tpexRows.map((row): PoolRow => ({ market: 'TPEx', ...row, dir: null, change: null })),
  ];

  const sorted = [...pool].sort((a, b) => (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0)).slice(0, 20);

  const [companyNames, changePercents] = await Promise.all([
    deps.companyProfiles.getCompanyNamesForSymbols(sorted.map((row) => row.symbol)),
    deps.priceChange.getCumulativeChangePercent(
      sorted.map((row) => ({ symbol: row.symbol, market: row.market, asOfDate: dateOf(row.market) })),
      ONE_DAY_CHANGE_TRADING_DAYS
    ),
  ]);
  // open/high/low/close/change 是 DB 的 Decimal 欄位，$queryRaw 撈出來是 Decimal 物件不是
  // 原生 number，直接塞進 JSON.stringify 會變成字串，要用 Number() 轉。
  const toNumber = (value: number | null) => (value === null ? null : Number(value));
  const rankings: VolumeTop20Row[] = sorted.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
    volume: row.volume.toString(),
    transaction: row.transaction === null ? null : row.transaction.toString(),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    dir: row.dir,
    change: toNumber(row.change),
    changePercent: changePercents.get(cumulativeChangePercentKey(row.market, row.symbol, dateOf(row.market))) ?? null,
  }));

  return { tradeDate: tradeDate.toISOString().slice(0, 10), rankings, warnings };
};
