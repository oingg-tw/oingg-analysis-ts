import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { companyExists } from '@/models/companyProfile';
import { getLatestDailyPrice, getLatestDailyPricesBatch, getDailyPriceHistory as getDailyPriceHistoryFromSource } from '@/models/twseMarketData';
import { getUpcomingExDividendNotices, getExDividendCalendar as getExDividendCalendarFromSource } from '@/models/twse/exDividendNotice';
import { getForeignShareholdingHistory as getForeignShareholdingHistoryFromSource } from '@/models/twse/foreignShareholding';
import { getStockPledgeRatioHistory as getStockPledgeRatioHistoryFromSource } from '@/models/twse/stockPledgeRatio';
import { getCompanyNamesForSymbols } from '@/models/companyProfile';
import type {
  StockPricesResult,
  StockQuoteResult,
  StockSummaryResult,
  ExDividendNoticesResult,
  ExDividendCalendarResult,
  ForeignShareholdingHistoryResult,
  StockPledgeRatioHistoryResult,
  DailyPriceHistoryResult,
} from './types';

// 2026-09-08 起改讀 pitMetrics（exchangePeRatio/exchangePbRatio/dividendYield，
// snapshotCadence='EOD'）取代舊架構的 MarketRatiosResult——舊表連同 domainMetrics/marketRatios.ts
// 一起退場了（filterCatalog.csv 最後 6 列確認是開發環境假資料誤判、沒有真實功能依賴，
// 見 abstract-crafting-journal.md）。2026-09-09 起改查 metricDailyCadenceValue——逐日型
// 指標已經從共用的 metric_values 拆到獨立的 metric_daily_cadence_values，tradeDate 在
// 那張表是 NOT NULL 的真正自然鍵，不再需要判斷「有沒有 tradeDate」。三個 metricCode 是
// 同一次 computeAndWriteMarketRatiosPit 呼叫一起寫入的，理論上 tradeDate 一致，這裡各自
// 獨立查「最新一筆」而不是假設一定同步，跟 getMetricHistory 的既有慣例一致（用
// knowledgeDate desc 取最新，不是相信呼叫端保證同步）。dataType/subsidiaryCompanyId
// 固定 '2'/''——這是純市場數字，沒有個體/合併報表的區分，只是延續 metric 識別欄位慣例，
// 見 computeMarketRatiosPit.ts 的說明。
const MARKET_RATIOS_DATA_TYPE = '2';
const MARKET_RATIOS_SUBSIDIARY_COMPANY_ID = '';

const getLatestMarketRatioValue = async (symbol: string, metricCode: string): Promise<{ tradeDate: Date; value: number | null } | null> => {
  const row = await analysisPrisma.metricDailyCadenceValue.findFirst({
    where: { symbol, metricCode, snapshotCadence: 'EOD', dataType: MARKET_RATIOS_DATA_TYPE, subsidiaryCompanyId: MARKET_RATIOS_SUBSIDIARY_COMPANY_ID },
    orderBy: { knowledgeDate: 'desc' },
  });
  if (!row) return null;
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

// 2026-09-13 web-nuxt 回報：個股頁靠前端寫死的 20 檔清單判斷「股票存不存在」，不在清單裡
// 的股票（例如 2801）一律顯示查無資料——誤把這個後端當成「要先撈全市場清單」的架構，實際
// 是按 symbol 現查。這支端點把個股頁需要的股價/漲跌/成交量/PER/PBR/殖利率/市值一次組給
// 呼叫端，取代原本要串 quote + daily-price-history + metric-history 三支的做法，讓
// web-nuxt 可以整個換掉那份寫死清單。
// 漲跌用 daily_price 最近兩個交易日的收盤價自己算（limit=2），跟 price/volume 同一次查詢、
// 保證同一組交易日，不會有「price 是今天、change 卻拿舊資料算」的不同步問題。
export const getStockSummary = async (symbol: string): Promise<StockSummaryResult | null> => {
  const [exists, priceEntries, peRatioRow, pbRatioRow, dividendYieldRow, marketCapRow] = await Promise.all([
    companyExists(symbol),
    getDailyPriceHistoryFromSource(symbol, 2),
    getLatestMarketRatioValue(symbol, 'exchangePeRatio'),
    getLatestMarketRatioValue(symbol, 'exchangePbRatio'),
    getLatestMarketRatioValue(symbol, 'dividendYield'),
    getLatestMarketRatioValue(symbol, 'liveMarketCap'),
  ]);

  if (!exists) return null;

  const latest = priceEntries.at(-1) ?? null;
  const previous = priceEntries.length >= 2 ? priceEntries.at(-2)! : null;
  const change =
    latest?.close !== null && latest?.close !== undefined && previous?.close !== null && previous?.close !== undefined
      ? {
          amount: Math.round((latest.close - previous.close) * 100) / 100,
          percent: previous.close !== 0 ? Math.round(((latest.close - previous.close) / previous.close) * 10000) / 100 : null,
        }
      : null;

  const representativeValuationDate = peRatioRow?.tradeDate ?? pbRatioRow?.tradeDate ?? dividendYieldRow?.tradeDate ?? null;

  return {
    symbol,
    price: latest ? { tradeDate: latest.tradeDate, close: latest.close, volume: latest.volume, change } : null,
    valuation: representativeValuationDate
      ? {
          tradeDate: representativeValuationDate.toISOString().slice(0, 10),
          peRatio: peRatioRow?.value ?? null,
          pbRatio: pbRatioRow?.value ?? null,
          dividendYield: dividendYieldRow?.value ?? null,
        }
      : null,
    marketCap: marketCapRow ? { tradeDate: marketCapRow.tradeDate.toISOString().slice(0, 10), value: marketCapRow.value } : null,
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
// src/models/twse/exDividendNotice.ts 的說明），沒有除權息預告的 symbol 直接不會
// 出現在回傳的 notices 裡，不是空陣列。
export const getExDividendNotices = async (symbols: string[]): Promise<ExDividendNoticesResult> => {
  const notices = await getUpcomingExDividendNotices(symbols);
  return { notices };
};

// 2026-09-10 web-nuxt 轉達使用者需求：全市場除權息日曆（月曆格狀呈現），不是針對已知的
// symbol 清單查——跟上面 getExDividendNotices 用同一份 export.ex_dividend_notice 資料源，
// 差別是不帶 symbol 篩選、改用日期區間，並附上 companyName（月曆情境需要顯示公司名稱，
// 不只是代號）。
export const getExDividendCalendar = async (startDate: Date, endDate: Date): Promise<ExDividendCalendarResult> => {
  const rows = await getExDividendCalendarFromSource(startDate, endDate);
  const nameMap = await getCompanyNamesForSymbols(rows.map((r) => r.symbol));
  return { entries: rows.map((r) => ({ ...r, companyName: nameMap.get(r.symbol) ?? null })) };
};

// 2026-09-08 web-nuxt 轉達使用者需求：個股頁面外資持股卡片。目前只有 2330 有真實資料
// （twse-ts 一次性回填，不是常態排程），其他 symbol 會回傳空陣列——前端顯示「尚未提供」
// 是前端自己的降級處理，這支不需要特別區分「查無資料」跟「這家公司真的沒有外資持股」。
export const getForeignShareholdingHistory = async (symbol: string, limit: number): Promise<ForeignShareholdingHistoryResult> => {
  const entries = await getForeignShareholdingHistoryFromSource(symbol, limit);
  return { symbol, entries };
};

// 2026-09-10 使用者要求：個股頁面董監事質押比例卡片，比照 getForeignShareholdingHistory
// 同一種「回傳完整歷史陣列，查無資料就是空陣列」的模式——不進 pitMetrics，讓前端直接對照
// TWSE 公告原始數字序列（見 stockPledgeRatio.ts 的說明）。
export const getStockPledgeRatioHistory = async (symbol: string, limit: number): Promise<StockPledgeRatioHistoryResult> => {
  const entries = await getStockPledgeRatioHistoryFromSource(symbol, limit);
  return { symbol, entries };
};

// 2026-09-10 web-nuxt 轉達使用者需求：個股頁面「市場評價」分頁要一張真正的逐日股價線圖——
// 既有 PE/PB 河流圖裡的 stockPrice metricCode 是季報型（每季一個點），不是逐日。這支直接查
// twse-ts/tpex-ts 的 daily_price，不經過 pitMetrics（那套架構是給「隨財報更新知識時點」的
// 指標用，逐日股價沒有這個概念，直接查表就好，不需要 knowledgeDate 解析）。
export const getDailyPriceHistory = async (symbol: string, limit: number): Promise<DailyPriceHistoryResult> => {
  const entries = await getDailyPriceHistoryFromSource(symbol, limit);
  return { symbol, entries };
};
