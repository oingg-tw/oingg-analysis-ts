import { registry } from '@/infrastructure/swagger/registry';
import {
  getQuoteParamsSchema,
  symbolsQuerySchema,
  getExDividendCalendarQuerySchema,
  getForeignShareholdingHistoryParamsSchema,
  getForeignShareholdingHistoryQuerySchema,
  getStockPledgeRatioHistoryParamsSchema,
  getStockPledgeRatioHistoryQuerySchema,
  getDailyPriceHistoryParamsSchema,
  getDailyPriceHistoryQuerySchema,
} from './controller';
import {
  stockQuoteResultSchema,
  stockSummaryResultSchema,
  stockPricesResultSchema,
  exDividendNoticesResultSchema,
  exDividendCalendarResultSchema,
  foreignShareholdingHistoryResultSchema,
  stockPledgeRatioHistoryResultSchema,
  dailyPriceHistoryResultSchema,
} from './types';

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
    path: '/stocks/{symbol}/summary',
    summary: '個股頁組合端點：一次回傳股價/漲跌/成交量/PER/PBR/殖利率/市值',
    description:
      '2026-09-13 web-nuxt 回報：個股頁靠前端寫死的 20 檔權值股清單判斷「股票存不存在」，' +
      '不在清單裡的股票（例如 2801）一律顯示查無資料——根本原因是誤把這個後端當成「要先撈' +
      '全市場清單」的架構，實際上是按 symbol 現查，任何有效代號都查得到。這支端點把個股頁' +
      '需要的 6 項組合成一次回傳，取代原本要串 GET /stocks/{symbol}/quote + ' +
      'GET /stocks/{symbol}/daily-price-history + GET /companies/metric-history' +
      '（metricCode=liveMarketCap）三支的做法。price/valuation/marketCap 三個區塊各自' +
      '獨立查詢、各自有自己的 tradeDate——理論上同一交易日會同步，但不保證，不要假設三者' +
      '一定同一天。change（漲跌）是用 daily_price 最近兩個交易日的收盤價算出來的，跟' +
      'price/volume 同一次查詢、保證同一組交易日；查無前一個交易日資料（例如剛掛牌）時' +
      'change 整體是 null。',
    tags: ['Stocks'],
    request: { params: getQuoteParamsSchema },
    responses: {
      200: { description: '個股頁摘要，price/valuation/marketCap 個別可能是 null。', content: { 'application/json': { schema: stockSummaryResultSchema } } },
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

  registry.registerPath({
    method: 'get',
    path: '/stocks/ex-dividend-calendar',
    summary: '全市場除權息日曆（月曆格狀呈現用，不需要先知道 symbol 清單）',
    description:
      '跟 GET /stocks/ex-dividend-notices 同一份資料源（twse-ts 的 export.ex_dividend_notice），差別是這支不用先給' +
      'symbol 清單——傳一個月份（month="YYYY-MM"）就能拿到全市場那個月所有除權息事件，適合「這個月市場上會發生什麼事」' +
      '這種日曆瀏覽情境，不是「我關心的這幾檔怎麼樣」。不像 ex-dividend-notices 只回傳未來事件，這支不篩選' +
      '「只看未來」——查哪個月的事件完全由呼叫端決定，可能是已經過去一半的當月。只有 TWSE 上市有這份資料，' +
      '也包含 ETF，不是只有一般股票。每筆都帶 symbol/companyName，依除權息基準日排序。exType/cashDividend 等' +
      '欄位語意跟 ex-dividend-notices 完全一致。',
    tags: ['Stocks'],
    request: { query: getExDividendCalendarQuerySchema },
    responses: {
      200: { description: '該月全市場除權息事件清單，依日期排序。', content: { 'application/json': { schema: exDividendCalendarResultSchema } } },
      400: { description: 'month 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/stocks/{symbol}/foreign-shareholding-history',
    summary: '查詢單一公司的外資/陸資持股比例歷史',
    description:
      '2026-09-08 新增，給個股頁面外資持股卡片用。資料來源是 twse-ts 的 export.foreign_shareholding' +
      '（TWSE MI_QFIIS 端點，取代已退役的 export.foreign_holding）。目前只有 2330 一檔有真實資料' +
      '（twse-ts 一次性回填 2021-09~2026-09，不是常態排程），其他公司會回傳空陣列 entries，不是' +
      '404——前端應該視為「尚未提供」而不是查詢失敗，之後 twse-ts 擴大到全市場會自動生效，不需要' +
      '改任何呼叫方式。availableInvestPercent（尚可投資比例）理論上等於 foreignLimitPercent - ' +
      'sharesHeldPercent，但這是資料源自己算好的欄位，不保證逐筆對得上，不要自己重算去對照。',
    tags: ['Stocks'],
    request: { params: getForeignShareholdingHistoryParamsSchema, query: getForeignShareholdingHistoryQuerySchema },
    responses: {
      200: { description: '依日期新到舊排序的外資持股歷史，查無資料的公司 entries 是空陣列。', content: { 'application/json': { schema: foreignShareholdingHistoryResultSchema } } },
      400: { description: '請求的參數格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/stocks/{symbol}/pledge-ratio-history',
    summary: '查詢單一公司的董監事及大股東股權質押比例歷史',
    description:
      '2026-09-10 新增，給個股頁面董監事質押比例卡片用（質押比例偏高通常被視為公司治理/財務風險警訊）。' +
      '資料來源是 twse-ts 的 export.stock_pledge_ratio（TWSE t187ap09_L），跟 foreign-shareholding-history' +
      '同一套模式。report_date 是 TWSE 出表日期，不定期更新（不是每個交易日、也不綁季度末），呼叫端不能假設' +
      '固定週期。刻意回傳完整歷史陣列（不是單一最新值/指標）——讓前端直接對照 TWSE 公告的原始數字序列，' +
      '比包一層「指標」抽象更利於使用者核對來源。剛開放，目前只回填了少數幾檔驗證用資料，其他公司會回傳' +
      '空陣列 entries，不是 404——前端應該視為「尚未提供」而不是查詢失敗。',
    tags: ['Stocks'],
    request: { params: getStockPledgeRatioHistoryParamsSchema, query: getStockPledgeRatioHistoryQuerySchema },
    responses: {
      200: {
        description: '依日期新到舊排序的董監事質押比例歷史，查無資料的公司 entries 是空陣列。',
        content: { 'application/json': { schema: stockPledgeRatioHistoryResultSchema } },
      },
      400: { description: '請求的參數格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/stocks/{symbol}/daily-price-history',
    summary: '查詢單一公司的逐日股價（開高低收量）',
    description:
      '2026-09-10 新增，給個股頁面「市場評價」分頁的逐日股價線圖用——跟既有 PE/PB 河流圖用的' +
      'stockPrice metricCode（季報型，每季一個點）不同，這支是真正的逐日資料，直接查' +
      'twse-ts/tpex-ts 的 export.daily_price，不經過 pitMetrics 架構（逐日股價沒有' +
      '「隨財報更新知識時點」的概念，不需要 knowledgeDate 解析）。一家公司只會在 TWSE/TPEx' +
      '其中一邊掛牌，本服務內部自己判斷、查兩邊，呼叫端不用先知道是上市還是上櫃。依交易日' +
      '由舊到新排序（畫線圖方便直接照順序畫）。查無資料（例如代號不存在）entries 是空陣列，' +
      '不是 404。\n\n' +
      'earliestAvailableTradeDate（2026-09-16 新增）：這檔股票在資料庫裡最早的交易日，' +
      '不受這次查詢的 limit 影響（即使 entries 因為 limit 被截斷，這欄還是回傳真正最早的' +
      '日期）——給「切換近1/2/3/5/8年」這類視窗選擇器用，直接拿這個日期跟今天算精確天數/' +
      '年數，判斷這檔股票夠不夠長的歷史（例如近期 IPO 公司），不用再用「250 交易日≈1年」' +
      '概估。',
    tags: ['Stocks'],
    request: { params: getDailyPriceHistoryParamsSchema, query: getDailyPriceHistoryQuerySchema },
    responses: {
      200: { description: '依交易日由舊到新排序的逐日股價，查無資料時 entries 是空陣列。', content: { 'application/json': { schema: dailyPriceHistoryResultSchema } } },
      400: { description: '請求的參數格式錯誤。' },
    },
  });
};
