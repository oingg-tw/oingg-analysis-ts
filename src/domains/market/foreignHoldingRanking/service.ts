import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { getSecuritySymbolSet, getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { ForeignHoldingChangeRow, ForeignHoldingRankingQuery, ForeignHoldingRankingResult } from './types';

interface RawForeignHoldingRow {
  symbol: string;
  shares_held: bigint;
  shares_held_percent: unknown;
}

// 找最新的兩個「有資料」的交易日——不能假設連續兩個日曆日，週末/國定假日中間會跳過。
const getLatestTwoTradeDates = async (): Promise<[Date, Date] | null> => {
  const rows = await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`
    SELECT DISTINCT trade_date FROM "export"."foreign_holding" ORDER BY trade_date DESC LIMIT 2
  `;
  if (rows.length < 2) return null;
  return [rows[0]!.trade_date, rows[1]!.trade_date];
};

// 外資持股「加碼/減碼排行」——2026-09-01 應使用者要求新增。比較最近兩個交易日的
// shares_held_percent（外資持股佔已發行股數比例），用百分點變動排序，不是張數變動幅度
// （張數會被增減資干擾，比例才是市場慣用的「外資加碼/減碼」定義，見 schema 註解）。
//
// 原本用 topPercent（排序後取前幾 %），2026-09-01 實測發現 foreign_holding 目前只鏡像
// 20 檔公司（twse-ts 匯出範圍尚未鋪滿全市場），母數這麼小時百分比排行沒有意義（10% 大概
// 只有 2 檔）——應使用者要求改成固定筆數的 limit，不受母數大小影響排行的可用性。
//
// 排除 ETF/衍生性商品（例如槓桿/反向 ETF）——這是主打上市公司證券的排行榜功能，見
// src/shared/sourceData/companyProfile.ts 的 getAllSecurityRows 說明。preferredStock: 'exclude'
// 維持這支排行原本的行為（特別股不算「上市公司股票」這種一般認知的排行標的）。
export const calculateForeignHoldingRanking = async (query: ForeignHoldingRankingQuery): Promise<ForeignHoldingRankingResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const dates = await getLatestTwoTradeDates();
  if (!dates) {
    warnings.push('foreign_holding 資料不足兩個交易日，無法比較變動。');
    return { tradeDate: '', previousTradeDate: '', limit, eligibleCompanyCount: 0, increases: [], decreases: [], warnings };
  }
  const [tradeDate, previousTradeDate] = dates;

  const [todayRows, previousRows, companySymbols] = await Promise.all([
    twseExportPrisma.$queryRaw<RawForeignHoldingRow[]>`SELECT symbol, shares_held, shares_held_percent FROM "export"."foreign_holding" WHERE trade_date = ${tradeDate}`,
    twseExportPrisma.$queryRaw<RawForeignHoldingRow[]>`SELECT symbol, shares_held, shares_held_percent FROM "export"."foreign_holding" WHERE trade_date = ${previousTradeDate}`,
    getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
  ]);

  const previousBySymbol = new Map(previousRows.map((row) => [row.symbol, Number(row.shares_held_percent)]));

  const changes: ForeignHoldingChangeRow[] = [];
  for (const row of todayRows) {
    if (!companySymbols.has(row.symbol)) continue; // ETF/衍生性商品，不是真正的上市公司，排除。
    const previousPercent = previousBySymbol.get(row.symbol);
    if (previousPercent === undefined) continue; // 前一個交易日沒有這家公司的資料，無法比較，跳過。
    const todayPercent = Number(row.shares_held_percent);
    changes.push({
      symbol: row.symbol,
      companyName: null, // 先留空，只對最後真的會回傳的 increases/decreases 補名稱，不用查全部 changes。
      sharesHeldPercent: todayPercent,
      previousSharesHeldPercent: previousPercent,
      changePercentagePoints: Math.round((todayPercent - previousPercent) * 100) / 100,
      sharesHeld: row.shares_held.toString(),
    });
  }

  if (changes.length === 0) {
    warnings.push(`${tradeDate.toISOString().slice(0, 10)} 跟 ${previousTradeDate.toISOString().slice(0, 10)} 沒有任何一家公司兩天都有資料，無法比較。`);
  }

  const increases = [...changes].sort((a, b) => b.changePercentagePoints - a.changePercentagePoints).slice(0, limit);
  const decreases = [...changes].sort((a, b) => a.changePercentagePoints - b.changePercentagePoints).slice(0, limit);

  const companyNames = await getCompanyNamesForSymbols([...new Set([...increases, ...decreases].map((row) => row.symbol))]);
  for (const row of [...increases, ...decreases]) {
    row.companyName = companyNames.get(row.symbol) ?? null;
  }

  return {
    tradeDate: tradeDate.toISOString().slice(0, 10),
    previousTradeDate: previousTradeDate.toISOString().slice(0, 10),
    limit,
    eligibleCompanyCount: changes.length,
    increases,
    decreases,
    warnings,
  };
};
