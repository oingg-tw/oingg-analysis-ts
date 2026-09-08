import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { companyExists } from '@/shared/sourceData/companyProfile';
import { getLatestDailyPrice, getLatestDailyPricesBatch } from '@/shared/sourceData/twseMarketData';
import { getUpcomingExDividendNotices } from '@/shared/sourceData/exDividendNotice';
import { getForeignShareholdingHistory as getForeignShareholdingHistoryFromSource } from '@/shared/sourceData/foreignShareholding';
import type { StockPricesResult, StockQuoteResult, ExDividendNoticesResult, ForeignShareholdingHistoryResult } from './types';

// 2026-09-08 起改讀 pitMetrics（exchangePeRatio/exchangePbRatio/dividendYield，
// basis='DAILY'）取代舊架構的 MarketRatiosResult——舊表連同 domainMetrics/marketRatios.ts
// 一起退場了（filterCatalog.csv 最後 6 列確認是開發環境假資料誤判、沒有真實功能依賴，
// 見 abstract-crafting-journal.md）。三個 metricCode 是同一次 computeAndWriteMarketRatiosPit
// 呼叫一起寫入的，理論上 tradeDate 一致，這裡各自獨立查「最新一筆」而不是假設一定同步，
// 跟 getMetricHistory 的既有慣例一致（用 knowledgeDate desc 取最新，不是相信呼叫端
// 保證同步）。dataType/subsidiaryCompanyId 固定 '2'/''——這是純市場數字，沒有個體/合併
// 報表的區分，只是延續 metric_values 的識別欄位慣例，見 computeMarketRatiosPit.ts 的說明。
const MARKET_RATIOS_DATA_TYPE = '2';
const MARKET_RATIOS_SUBSIDIARY_COMPANY_ID = '';

const getLatestMarketRatioValue = async (symbol: string, metricCode: string): Promise<{ tradeDate: Date; value: number | null } | null> => {
  const row = await analysisPrisma.metricValue.findFirst({
    where: { symbol, metricCode, basis: 'DAILY', dataType: MARKET_RATIOS_DATA_TYPE, subsidiaryCompanyId: MARKET_RATIOS_SUBSIDIARY_COMPANY_ID },
    orderBy: { knowledgeDate: 'desc' },
  });
  if (!row || row.tradeDate === null) return null;
  return { tradeDate: row.tradeDate, value: row.value !== null ? Number(row.value) : null };
};

// 給 bff-ts 的 GET /stocks/:symbol/quote 用（取代他們拆掉直連 twse/tpex DB 後留的 503）。
// 回傳 null 代表這家公司在上市、上櫃都查無登記資料，controller 那層轉成 404；公司存在但查無
// 股價/估值資料是另一回事，price/valuation 個別是 null，仍然是 200——bff-ts 的規格明確要求
// 這兩種情境要分開。
export const getStockQuote = async (symbol: string): Promise<StockQuoteResult | null> => {
  const [exists, price, peRatioRow, pbRatioRow, dividendYieldRow] = await Promise.all([
    companyExists(symbol),
    getLatestDailyPrice(symbol),
    getLatestMarketRatioValue(symbol, 'exchangePeRatio'),
    getLatestMarketRatioValue(symbol, 'exchangePbRatio'),
    getLatestMarketRatioValue(symbol, 'dividendYield'),
  ]);

  if (!exists) return null;

  // 三者理論上是同一次批次寫入、tradeDate 一致，但各自獨立查詢不保證同步——用任一筆
  // 有值的 tradeDate 當代表（優先 peRatio，其次 pbRatio/dividendYield），三者都查無
  // 資料時 valuation 整體是 null，跟舊架構「查無估值資料」的語意一致。
  const representativeTradeDate = peRatioRow?.tradeDate ?? pbRatioRow?.tradeDate ?? dividendYieldRow?.tradeDate ?? null;

  return {
    symbol,
    price: price ? { tradeDate: price.tradeDate.toISOString().slice(0, 10), close: price.close } : null,
    valuation: representativeTradeDate
      ? {
          tradeDate: representativeTradeDate.toISOString().slice(0, 10),
          peRatio: peRatioRow?.value ?? null,
          pbRatio: pbRatioRow?.value ?? null,
          dividendYield: dividendYieldRow?.value ?? null,
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

// 給個股頁面「下次除權息」提示、觀察清單「近期除權息」卡片用——2026-09-04 應 web-nuxt
// 要求新增，同一個 symbol 參數同時支援單一公司（個股頁面）跟多公司批次查詢（觀察清單），
// 跟 getStockPrices 同一種慣例。只有 TWSE 有這份資料（見
// src/shared/sourceData/exDividendNotice.ts 的說明），沒有除權息預告的 symbol 直接不會
// 出現在回傳的 notices 裡，不是空陣列。
export const getExDividendNotices = async (symbols: string[]): Promise<ExDividendNoticesResult> => {
  const notices = await getUpcomingExDividendNotices(symbols);
  return { notices };
};

// 2026-09-08 web-nuxt 轉達使用者需求：個股頁面外資持股卡片。目前只有 2330 有真實資料
// （twse-ts 一次性回填，不是常態排程），其他 symbol 會回傳空陣列——前端顯示「尚未提供」
// 是前端自己的降級處理，這支不需要特別區分「查無資料」跟「這家公司真的沒有外資持股」。
export const getForeignShareholdingHistory = async (symbol: string, limit: number): Promise<ForeignShareholdingHistoryResult> => {
  const entries = await getForeignShareholdingHistoryFromSource(symbol, limit);
  return { symbol, entries };
};
