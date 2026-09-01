import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { companyExists } from '@/shared/sourceData/companyProfile';
import { getLatestDailyPrice, getLatestDailyPricesBatch } from '@/shared/sourceData/twseMarketData';
import type { StockPricesResult, StockQuoteResult } from './types';

// 給 bff-ts 的 GET /stocks/:symbol/quote 用（取代他們拆掉直連 twse/tpex DB 後留的 503）。
// 回傳 null 代表這家公司在上市、上櫃都查無登記資料，controller 那層轉成 404；公司存在但查無
// 股價/估值資料是另一回事，price/valuation 個別是 null，仍然是 200——bff-ts 的規格明確要求
// 這兩種情境要分開。
export const getStockQuote = async (symbol: string): Promise<StockQuoteResult | null> => {
  const [exists, price, valuationRow] = await Promise.all([
    companyExists(symbol),
    getLatestDailyPrice(symbol),
    analysisPrisma.marketRatiosResult.findFirst({ where: { symbol }, orderBy: { tradeDate: 'desc' } }),
  ]);

  if (!exists) return null;

  return {
    symbol,
    price: price ? { tradeDate: price.tradeDate.toISOString().slice(0, 10), close: price.close } : null,
    valuation: valuationRow
      ? {
          tradeDate: valuationRow.tradeDate.toISOString().slice(0, 10),
          peRatio: valuationRow.peRatio !== null ? Number(valuationRow.peRatio) : null,
          pbRatio: valuationRow.pbRatio !== null ? Number(valuationRow.pbRatio) : null,
          dividendYield: valuationRow.dividendYieldPct !== null ? Number(valuationRow.dividendYieldPct) : null,
        }
      : null,
  };
};

// 給 bff-ts 的 GET /stocks/prices?symbols=... 用——他們的用法是「給我這確切幾檔的股價」
// （一次最多幾十檔，screener 一頁的量），不是開放式查詢，所以這支刻意不做 limit/count_only：
// 查不到的 symbol 就不會出現在 prices 物件裡，不是靜默截斷成某個數量以內。
export const getStockPrices = async (symbols: string[]): Promise<StockPricesResult> => {
  const priceMap = await getLatestDailyPricesBatch(symbols);

  const prices: StockPricesResult['prices'] = {};
  for (const [symbol, price] of priceMap) {
    prices[symbol] = { close: price.close, tradeDate: price.tradeDate.toISOString().slice(0, 10) };
  }
  return { prices };
};
