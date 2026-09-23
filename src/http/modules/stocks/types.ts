import { z } from 'zod';
import type {
  DailyPriceHistoryResult,
  ExDividendCalendarResult,
  ExDividendNoticesResult,
  ForeignShareholdingHistoryResult,
  StockPledgeRatioHistoryResult,
  StockPricesResult,
  StockQuoteResult,
  StockSummaryResult,
} from '@/application/stocks/types';
import type { ExDividendCalendarEntry, ExDividendNoticeEntry, ForeignShareholdingEntry, StockPledgeRatioEntry } from '@/application/ports/marketData';

// GET /stocks/* 的回應 schema（OpenAPI 文件用）。2026-09-17 Phase 4：形狀的真理來源是 application/stocks/types.ts
// 跟 application/ports/marketData.ts 的介面，這裡每個 schema 用 satisfies 釘住，欄位漂了 tsc 會擋；四個 entry
// schema 以前定義在 infrastructure 的 repository 檔案裡（http 直接 import infrastructure 是分層違規），描述文字
// 逐字搬過來。

export const stockQuotePriceSchema = z.object({
  tradeDate: z.string(),
  close: z.number().nullable(),
});

export const stockQuoteValuationSchema = z.object({
  tradeDate: z.string(),
  peRatio: z.number().nullable(),
  pbRatio: z.number().nullable(),
  dividendYield: z.number().nullable(),
});

export const stockQuoteResultSchema = z.object({
  symbol: z.string(),
  price: stockQuotePriceSchema.nullable(),
  valuation: stockQuoteValuationSchema.nullable(),
}) satisfies z.ZodType<StockQuoteResult>;

// 2026-09-13 web-nuxt 回報：個股頁一直靠前端寫死的 20 檔權值股清單（MOCK_STOCK_UNIVERSE）
// 判斷「這檔股票存不存在」，2801 這類不在清單裡的股票會顯示「找不到這檔股票」——根本原因
// 是誤以為要先撈一份全市場清單存起來，這個後端的設計其實是「按 symbol 現查」，不需要
// 全市場清單。這支端點把個股頁需要的 6 項（股價/漲跌/成交量/PER/PBR/殖利率/市值）組合
// 成一次回傳，取代原本要串 3 支端點（quote + daily-price-history + metric-history）的做法。
// 三個區塊(price/valuation/marketCap)各自獨立查詢、各自有自己的 tradeDate——理論上同一
// 交易日會同步，但不保證（跟既有 stockQuoteResultSchema 的 price/valuation 分開同一個
// 理由），不要假設三者一定同一天。
export const stockSummaryChangeSchema = z.object({
  amount: z.number().nullable().meta({ description: '收盤價比前一個交易日的變動金額' }),
  percent: z.number().nullable().meta({ description: '變動百分比；前一交易日收盤價為 0 時是 null（避免除以零）' }),
});

export const stockSummaryPriceSchema = z.object({
  tradeDate: z.string(),
  close: z.number().nullable(),
  volume: z.number().nullable(),
  change: stockSummaryChangeSchema.nullable().meta({ description: '查無前一個交易日資料時整體是 null（例如剛掛牌只有一天資料）' }),
});

export const stockSummaryMarketCapSchema = z.object({
  tradeDate: z.string(),
  value: z.number().nullable(),
});

export const stockSummaryResultSchema = z.object({
  symbol: z.string(),
  price: stockSummaryPriceSchema.nullable(),
  valuation: stockQuoteValuationSchema.nullable(),
  marketCap: stockSummaryMarketCapSchema.nullable(),
}) satisfies z.ZodType<StockSummaryResult>;

export const stockPricesResultSchema = z.object({
  prices: z.record(z.string(), z.object({ close: z.number().nullable(), tradeDate: z.string() })).meta({
    description: 'key 是 symbol，查不到的 symbol 直接不出現（不是回傳 null 值）',
  }),
}) satisfies z.ZodType<StockPricesResult>;

// 上市股票/ETF 除權除息預告——2026-09-04 twse-ts 新開的 export.ex_dividend_notice view
// （來源：TWSE TWT48U_ALL），只有上市（TWSE）有，TPEx 沒有對應資料源。symbol 不只有一般股票，
// 也有 ETF；ex_type 只有三種值，是同一筆事件用這個欄位標示類型，不是除權/除息各自分開一筆。
export const exDividendNoticeEntrySchema = z.object({
  exDate: z.string().meta({ description: '"YYYY-MM-DD"，除權息基準日，是未來日期（TWSE 每天預告接下來的事件）' }),
  exType: z.enum(['息', '權', '權息']).meta({ description: '息=純除息、權=純除權、權息=合併發放，是同一筆事件用這個欄位標示類型' }),
  stockDividendRatio: z.number().nullable().meta({ description: '股票股利比例（配股）；純除息時是 null' }),
  subscriptionRatio: z.number().nullable().meta({ description: '認購比例' }),
  subscriptionPricePerShare: z.number().nullable().meta({ description: '認購價' }),
  cashDividend: z.number().nullable().meta({ description: '現金股利（每股金額）' }),
  sharesOffered: z.number().nullable(),
  sharesEmpOwner: z.number().nullable(),
  sharesholderOwner: z.number().nullable(),
  stockHoldingRatio: z.number().nullable(),
}) satisfies z.ZodType<ExDividendNoticeEntry>;

// 2026-09-22 月曆往回翻：status 區分預告（twse 預告表）與已實現（mops 股利分派公告），見 application/ports/marketData.ts。
export const exDividendCalendarEntrySchema = exDividendNoticeEntrySchema.extend({
  symbol: z.string(),
  status: z.enum(['announced', 'realized']).meta({ description: 'announced = 除息日在今天（含）以後的預告，內容可能再變動；realized = 除息日已過、來自股利分派公告的事實' }),
  paymentDate: z.string().nullable().meta({ description: '現金股利發放日 "YYYY-MM-DD"，只有 realized 列有值' }),
  fiscalYear: z.number().int().nullable().meta({ description: '股利所屬年度（西元），只有 realized 列有值' }),
  // 2026-09-23 併入 ETF 收益分配。ETF 不在個股那兩個來源裡（twse 預告表只收個股、mops 股利分派公告是上市櫃
  // **公司**的決議），所以在此之前月曆「往前看有 ETF、往回翻沒有」。
  securityType: z.enum(['COMMON', 'ETF']).meta({
    description: '2026-09-23 新增：COMMON = 個股（含特別股），ETF = 指數股票型基金的收益分配。下面三個欄位只有 ETF 列有值。',
  }),
  recordDate: z.string().nullable().meta({ description: '2026-09-23 新增：收益分配基準日 "YYYY-MM-DD"，只有 ETF 列有值' }),
  distributionPerUnit: z.number().nullable().meta({
    description: '2026-09-23 新增：每受益權單位分配金額（元），只有 ETF 列有值。個股的每股現金股利仍在 cashDividend，兩者不要混用',
  }),
  composition: z
    .object({
      dividendIncomePct: z.number().nullable(),
      interestIncomePct: z.number().nullable(),
      incomeEqualizationPct: z.number().nullable(),
      realizedCapitalGainPct: z.number().nullable(),
      otherIncomePct: z.number().nullable(),
    })
    .nullable()
    .meta({
      description:
        '2026-09-23 新增：ETF 收益分配的組成百分比拆解，只有 ETF 列有值（個股列為 null）。' +
        'incomeEqualizationPct 是**收益平準金**佔比，在台灣是「配息是不是配到本金」的核心爭議數字。' +
        '**原樣透傳、不做任何評價**。注意每一項的 null 與 0 是兩件事：null = 該次配息沒有揭露組成，' +
        '0 = 有揭露且該項確實為零。實測近 24 個月 1,965 筆裡 1,783 筆為 0、166 筆 > 0、16 筆未揭露——' +
        '資料源本來就分得開，不要把 null 當成 0 顯示。',
    }),
}) satisfies z.ZodType<ExDividendCalendarEntry>;

export const exDividendNoticesResultSchema = z.object({
  notices: z.record(z.string(), z.array(exDividendNoticeEntrySchema)).meta({
    description: 'key 是 symbol，查不到的 symbol 直接不出現',
  }),
}) satisfies z.ZodType<ExDividendNoticesResult>;

export const exDividendCalendarResultSchema = z.object({
  entries: exDividendCalendarEntrySchema.extend({ companyName: z.string().nullable() }).array().meta({
    description:
      '依除權息基準日由舊到新排序（同一天有多筆時再依 symbol 排序），每一筆都帶 symbol/companyName。以「今天」為界：今天（含）以後是 twse 預告表（status announced），' +
      '之前是 mops 股利分派公告（status realized）。realized 列只有 cashDividend/stockDividendRatio（元／股 ÷ 面額）/paymentDate/fiscalYear 有值，現金增資相關欄位一律 null（兩來源單位不同，不對應）；' +
      'announced 列的 paymentDate/fiscalYear 一律 null。歷史深度：分派公告全市場 2026-03 起，更早月份目前只有少數公司（mops-ts 回補中）。',
  }),
}) satisfies z.ZodType<ExDividendCalendarResult>;

// 2026-09-08 twse-ts 新建的 export.foreign_shareholding view——全市場個股層級外資/陸資持股統計
// （來源 TWSE MI_QFIIS）。只挑個股頁面卡片實際會用到的三個欄位。
export const foreignShareholdingEntrySchema = z.object({
  tradeDate: z.string().meta({ description: '"YYYY-MM-DD"' }),
  sharesHeldPercent: z.number().nullable().meta({ description: '外資/陸資持股比例（%）' }),
  foreignLimitPercent: z.number().nullable().meta({ description: '法定外資/陸資持股上限（%），大多數股票是 100（無限制）' }),
  availableInvestPercent: z.number().nullable().meta({ description: '尚可投資比例（%）= foreignLimitPercent - sharesHeldPercent，理論上的關係，不保證逐筆對得上（資料源自己算的）' }),
}) satisfies z.ZodType<ForeignShareholdingEntry>;

export const foreignShareholdingHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(foreignShareholdingEntrySchema).meta({ description: '依日期新到舊排序' }),
}) satisfies z.ZodType<ForeignShareholdingHistoryResult>;

// 2026-09-10 twse-ts 新建的 export.stock_pledge_ratio view——董監事及大股東股權質押比例（TWSE t187ap09_L），
// report_date 是 TWSE 出表日期、不定期更新。刻意回傳完整歷史陣列讓使用者自己核對原始公告數字。
export const stockPledgeRatioEntrySchema = z.object({
  reportDate: z.string().meta({ description: '"YYYY-MM-DD"，TWSE 出表日期，不定期更新' }),
  pledgePercent: z.number().nullable().meta({ description: '董監事及大股東股權質押比例（%）' }),
}) satisfies z.ZodType<StockPledgeRatioEntry>;

export const stockPledgeRatioHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(stockPledgeRatioEntrySchema).meta({ description: '依日期新到舊排序' }),
}) satisfies z.ZodType<StockPledgeRatioHistoryResult>;

export const dailyPriceHistoryEntrySchema = z.object({
  tradeDate: z.string().meta({ description: '"YYYY-MM-DD"' }),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  volume: z.number().nullable(),
});

export const dailyPriceHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(dailyPriceHistoryEntrySchema).meta({ description: '依交易日由舊到新排序（畫線圖方便直接照順序畫，不用前端自己反轉）' }),
  earliestAvailableTradeDate: z.string().nullable().meta({
    description:
      '"YYYY-MM-DD"，這檔股票在資料庫裡最早的交易日——這是這檔股票全部歷史的範圍，不受這次查詢的 limit 影響（即使 entries 因為 limit 被截斷，這欄還是回傳真正最早的日期）。' +
      '用來精確判斷「這檔股票實際有多少年價格歷史」（例如近期 IPO 公司歷史不到 5 年），不用再用「250 交易日≈1年」概估，直接拿這個日期跟今天算天數/年數即可；查無任何資料時為 null。',
  }),
}) satisfies z.ZodType<DailyPriceHistoryResult>;
