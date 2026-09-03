import twseExportPrisma from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { PriceLimitRangeResult, PriceLimitRangeRow } from './types';

interface RawTwsePriceLimitRangeRow {
  symbol: string;
  rank_group: string;
  limit_up: number | null;
  limit_down: number | null;
  limit_range: number | null;
  opening_ref_price: number | null;
  previous_day_price: number | null;
  allow_odd_lot_trade: string | null;
}

interface RawTpexPriceLimitRangeRow {
  symbol: string;
  rank_group: string;
  limit_up: number | null;
  limit_down: number | null;
  limit_range: number | null;
}

interface PoolRow {
  market: 'TWSE' | 'TPEx';
  symbol: string;
  rank_group: string;
  limit_up: number | null;
  limit_down: number | null;
  limit_range: number | null;
  opening_ref_price: number | null;
  previous_day_price: number | null;
  allow_odd_lot_trade: string | null;
}

// 上市個股漲跌停幅度最大/最小各 20 檔——twse-ts/tpex-ts 給的是「各自市場」算好的前 20（不是
// 全市場原始資料），2026-09-01 應使用者要求合併成真正的「全市場前 20」：widest（幅度最大）
// 把兩邊 rank_group='top' 的 candidate pool 合併後依 limitRange 由大到小重排取前 20；
// narrowest（幅度最小）同理，兩邊 rank_group='bottom' 合併後由小到大取前 20。兩邊給的都已經
// 是各自市場的極值前 20，合併後排出來的前 20 一定涵蓋真正的全市場前 20。
//
// TPEx 版本欄位比 TWSE 精簡（沒有 opening_ref_price/previous_day_price/allow_odd_lot_trade），
// 沒有的欄位回傳 null。twse-ts/tpex-ts 都已經先過濾成只留真正上市/上櫃公司，這裡不用再濾。
export const getPriceLimitRange = async (): Promise<PriceLimitRangeResult> => {
  const warnings: string[] = [];

  const [twseDateRows, tpexDateRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ trade_date: Date | null }[]>`SELECT MAX(trade_date) as trade_date FROM "export"."price_limit_range"`,
    tpexExportPrisma.$queryRaw<{ trade_date: Date | null }[]>`SELECT MAX(trade_date) as trade_date FROM "export"."price_limit_range"`,
  ]);
  const candidates = [twseDateRows[0]?.trade_date, tpexDateRows[0]?.trade_date].filter((d): d is Date => d != null);
  if (candidates.length === 0) {
    warnings.push('查無漲跌停幅度資料。');
    return { tradeDate: '', widest: [], narrowest: [], warnings };
  }
  const tradeDate = candidates.reduce((latest, current) => (current > latest ? current : latest));

  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<RawTwsePriceLimitRangeRow[]>`
      SELECT symbol, rank_group, limit_up, limit_down, limit_range, opening_ref_price, previous_day_price, allow_odd_lot_trade
      FROM "export"."price_limit_range"
      WHERE trade_date = ${tradeDate}
    `,
    tpexExportPrisma.$queryRaw<RawTpexPriceLimitRangeRow[]>`
      SELECT symbol, rank_group, limit_up, limit_down, limit_range
      FROM "export"."price_limit_range"
      WHERE trade_date = ${tradeDate}
    `,
  ]);

  const pool: PoolRow[] = [
    ...twseRows.map((row): PoolRow => ({ market: 'TWSE', ...row })),
    ...tpexRows.map(
      (row): PoolRow => ({
        market: 'TPEx',
        symbol: row.symbol,
        rank_group: row.rank_group,
        limit_up: row.limit_up,
        limit_down: row.limit_down,
        limit_range: row.limit_range,
        opening_ref_price: null,
        previous_day_price: null,
        allow_odd_lot_trade: null,
      })
    ),
  ];

  const companyNames = await getCompanyNamesForSymbols(pool.map((row) => row.symbol));
  // limit_up/limit_down/limit_range/opening_ref_price/previous_day_price 是 DB 的 Decimal
  // 欄位，$queryRaw 撈出來是 Decimal 物件不是原生 number，直接塞進 JSON.stringify 會變成
  // 字串，要用 Number() 轉。
  const toNumber = (value: number | null) => (value === null ? null : Number(value));
  const toRow = (row: PoolRow, rank: number): PriceLimitRangeRow => ({
    rank,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
    limitUp: toNumber(row.limit_up),
    limitDown: toNumber(row.limit_down),
    limitRange: toNumber(row.limit_range),
    openingRefPrice: toNumber(row.opening_ref_price),
    previousDayPrice: toNumber(row.previous_day_price),
    allowOddLotTrade: row.allow_odd_lot_trade,
  });

  const widest = pool
    .filter((row) => row.rank_group === 'top')
    .sort((a, b) => Number(b.limit_range ?? -Infinity) - Number(a.limit_range ?? -Infinity))
    .slice(0, 20)
    .map((row, index) => toRow(row, index + 1));
  const narrowest = pool
    .filter((row) => row.rank_group === 'bottom')
    .sort((a, b) => Number(a.limit_range ?? Infinity) - Number(b.limit_range ?? Infinity))
    .slice(0, 20)
    .map((row, index) => toRow(row, index + 1));

  return { tradeDate: tradeDate.toISOString().slice(0, 10), widest, narrowest, warnings };
};
