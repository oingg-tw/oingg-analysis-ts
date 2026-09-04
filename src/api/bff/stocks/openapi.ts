import { registry } from '@/adapters/swagger/registry';
import { getQuoteParamsSchema, symbolsQuerySchema } from './controller';
import { stockQuoteResultSchema, stockPricesResultSchema, exDividendNoticesResultSchema } from './types';

export const registerStocksOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/stocks/{symbol}/quote',
    summary: '查詢單一公司的最新股價/估值報價',
    description:
      '給 bff-ts 用，取代他們拆掉直連 twse/tpex DB 後留的 503——本服務不想讓呼叫端知道一檔股票是上市還是上櫃，這支內部自己判斷、查兩邊。' +
      'price/valuation 個別是 null 代表「公司存在，但查無股價/估值資料」（例如剛上市還沒有交易紀錄），跟「公司根本不存在」（回 404）是不同情境。',
    tags: ['Stocks'],
    request: { params: getQuoteParamsSchema },
    responses: {
      200: { description: '最新報價，price/valuation 個別可能是 null。', content: { 'application/json': { schema: stockQuoteResultSchema } } },
      404: { description: '公司代號在上市、上櫃都查無登記資料。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/stocks/prices',
    summary: '批次查詢多家公司的最新股價',
    description:
      '給 bff-ts 用，一次查明確列出的幾檔公司（例如 screener 一頁的量），不是開放式查詢。刻意不做 limit/count_only：' +
      '查不到的 symbol 就不會出現在 prices 物件裡，不會靜默截斷成某個數量以內——symbols 一次最多 100 檔，超過直接回 400，不會默默只回一部分。',
    tags: ['Stocks'],
    request: { query: symbolsQuerySchema },
    responses: {
      200: {
        description: '以 symbol 為 key 的股價對照表，查不到的 symbol 不會出現在裡面。',
        content: { 'application/json': { schema: stockPricesResultSchema } },
      },
      400: { description: '請求的參數格式錯誤，或 symbols 超過一次上限。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/stocks/ex-dividend-notices',
    summary: '批次查詢多家公司/ETF 的除權息預告',
    description:
      '同一支端點同時支援個股頁面「下次除權息」提示（傳單一 symbol）跟觀察清單「近期除權息」卡片（傳多個 symbol）——' +
      '跟 GET /stocks/prices 同一種批次查詢慣例。資料來源是 twse-ts 的 export.ex_dividend_notice（TWSE TWT48U_ALL），' +
      '只有 TWSE 上市有這份資料，TPEx 沒有對應資料源，也不是只有一般股票——ETF（例如 00939）也會出現在裡面。' +
      '純原始公告資料，沒有還原參考價這類衍生欄位。只回傳「今天（含）以後」的預告事件——這張表本身可能還留著剛過去幾天的紀錄，' +
      '這支端點過濾掉，只給接下來要發生的事。查不到除權息預告的 symbol 不會出現在 notices 物件裡，不是空陣列。' +
      'exType 只有三種值：息（純除息）、權（純除權）、權息（合併發放）——是同一筆事件用這個欄位標示類型，不是除權/除息各自分開一筆。' +
      '純除息時權證相關欄位（stockDividendRatio/subscriptionRatio/subscriptionPricePerShare 等）是 null，只有 cashDividend 有值。',
    tags: ['Stocks'],
    request: { query: symbolsQuerySchema },
    responses: {
      200: {
        description: '以 symbol 為 key 的除權息預告陣列對照表（同一檔可能有多筆未來事件），查不到的 symbol 不會出現在裡面。',
        content: { 'application/json': { schema: exDividendNoticesResultSchema } },
      },
      400: { description: '請求的參數格式錯誤，或 symbols 超過一次上限。' },
    },
  });
};
