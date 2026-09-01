import twsePrisma from '@/adapters/prisma/twseClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { PriceLimitRangeResult, PriceLimitRangeRow } from './types';

interface RawPriceLimitRangeRow {
  symbol: string;
  rank_group: string;
  rank: number;
  limit_up: number | null;
  limit_down: number | null;
  limit_range: number | null;
  opening_ref_price: number | null;
  previous_day_price: number | null;
  allow_odd_lot_trade: string | null;
}

// 上市個股漲跌停幅度最大/最小各 20 檔——2026-09-01 應使用者要求新增。twse-ts 已經先過濾成
// 只留真正上市公司（原始回應含權證共 3.3 萬多筆），再取幅度最大前 20 + 最小後 20，每天最多
// 40 筆，這裡不用再濾一次。
export const getPriceLimitRange = async (): Promise<PriceLimitRangeResult> => {
  const warnings: string[] = [];

  const latestDateRows = await twsePrisma.$queryRaw<{ trade_date: Date | null }[]>`
    SELECT MAX(trade_date) as trade_date FROM "export"."price_limit_range"
  `;
  const tradeDate = latestDateRows[0]?.trade_date;
  if (!tradeDate) {
    warnings.push('查無漲跌停幅度資料。');
    return { tradeDate: '', widest: [], narrowest: [], warnings };
  }

  const rows = await twsePrisma.$queryRaw<RawPriceLimitRangeRow[]>`
    SELECT symbol, rank_group, rank, limit_up, limit_down, limit_range, opening_ref_price, previous_day_price, allow_odd_lot_trade
    FROM "export"."price_limit_range"
    WHERE trade_date = ${tradeDate}
    ORDER BY rank_group ASC, rank ASC
  `;

  const companyNames = await getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  // limit_up/limit_down/limit_range/opening_ref_price/previous_day_price 是 DB 的 Decimal
  // 欄位，$queryRaw 撈出來是 Decimal 物件不是原生 number，直接塞進 JSON.stringify 會變成
  // 字串，要用 Number() 轉。
  const toNumber = (value: number | null) => (value === null ? null : Number(value));
  const toRow = (row: RawPriceLimitRangeRow): PriceLimitRangeRow => ({
    rank: row.rank,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    limitUp: toNumber(row.limit_up),
    limitDown: toNumber(row.limit_down),
    limitRange: toNumber(row.limit_range),
    openingRefPrice: toNumber(row.opening_ref_price),
    previousDayPrice: toNumber(row.previous_day_price),
    allowOddLotTrade: row.allow_odd_lot_trade,
  });

  const widest = rows.filter((row) => row.rank_group === 'top').map(toRow);
  const narrowest = rows.filter((row) => row.rank_group === 'bottom').map(toRow);

  return { tradeDate: tradeDate.toISOString().slice(0, 10), widest, narrowest, warnings };
};
