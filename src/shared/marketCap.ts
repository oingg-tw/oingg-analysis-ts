import prisma from '@/adapters/prisma/index';
import { getPaidInSharesAsOf } from './capitalStock';

export interface MarketCapAsOf {
  marketCap: number; // 股價 x 流通股數（元）
  tradeDate: string; // YYYY-MM-DD；實際用到的股價交易日（asOfDate 或之前最近一筆）
  closePrice: number;
  paidInShares: bigint;
}

// 市值 = 個股收盤價（mops 的 daily_stock_price，asOfDate 或之前最近一個交易日）
// x 流通股數（capital_stock_history，asOfDate 當下生效的股本，見 getPaidInSharesAsOf）。
//
// 跟 src/domains/portfolio/beta/ 用的是同一張股價表——**目前 daily_stock_price 只有 2330
// 一檔股票有資料**，查其他公司會回傳 null，不是查詢邏輯錯誤，是資料源覆蓋率限制。
//
// 沒有用 oingg-twse 的 daily_price/company_profile（2026-08-21 驗證過的另一條路線）：
// 那條路線的 company_profile.issued_shares 是「現在的」已發行股數快照，不是某個歷史時點的股數，
// 拿去配歷史財報季度的市值會不準；oingg-twse 的 daily_price 歷史也只有幾天，配歷史報告日
// 幾乎都會是 null。mops 這條路線雖然只有 2330，但兩個資料源都能正確反映「某個歷史時點」，
// 跟 Altman Z-Score/PSR 這類需要「某季財報那天的市值」的指標比較搭。
export const getMarketCapAsOf = async (symbol: string, asOfDate: Date): Promise<MarketCapAsOf | null> => {
  const [priceRow, shares] = await Promise.all([
    prisma.dailyStockPrice.findFirst({
      where: { symbol, tradeDate: { lte: asOfDate } },
      orderBy: { tradeDate: 'desc' },
      select: { tradeDate: true, closePrice: true },
    }),
    getPaidInSharesAsOf(symbol, asOfDate),
  ]);

  if (!priceRow || priceRow.closePrice === null || !shares) return null;

  return {
    marketCap: Number(priceRow.closePrice) * Number(shares.paidInShares),
    tradeDate: priceRow.tradeDate.toISOString().slice(0, 10),
    closePrice: Number(priceRow.closePrice),
    paidInShares: shares.paidInShares,
  };
};
