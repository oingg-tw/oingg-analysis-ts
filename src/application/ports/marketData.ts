// 市場行情 port。四組單方法介面對應指標核心四種用法，MarketDataPort 是全部的交集：
// - 某個基準日當下的股價/市值（季報型估值指標：asOfDate = 財報公告日）。
// - 某個基準日當下的交易所每日估值（本益比/淨值比/殖利率，chowderNumber/marketRatios）。
// - 最新一筆股價（live* 指標：不看歷史，就是「現在」）。
// - 收盤價序列 + 大盤指數序列（beta 的滾動窗口）。
// 實作在 infrastructure/repositories/twse/marketCap.ts 的 twseMarketData（組合 twse/tpex 兩邊的查詢）。

export interface StockPriceAsOf {
  closePrice: number;
  tradeDate: string; // YYYY-MM-DD；實際用到的股價交易日（asOfDate 或之前最近一筆）
}

export interface MarketCapAsOf {
  marketCap: number; // 股價 x 流通股數（元）
  tradeDate: string; // YYYY-MM-DD；實際用到的股價交易日（asOfDate 或之前最近一筆）
  closePrice: number;
  paidInShares: bigint;
}

export interface DailyValuationAsOf {
  tradeDate: Date;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
}

export interface DailyPriceAsOf {
  tradeDate: Date;
  close: number | null;
}

// 原始 SQL 列形狀（close 是 Decimal 物件，Number() 在呼叫端做）——beta 的窗口計算讀這個。
export interface DailyCloseRow {
  trade_date: Date;
  close: unknown;
}

export interface StockPricePort {
  getStockPrice(symbol: string, asOfDate: Date): Promise<StockPriceAsOf | null>;
}

export interface MarketCapPort {
  getMarketCap(symbol: string, asOfDate: Date): Promise<MarketCapAsOf | null>;
}

export interface DailyValuationPort {
  // 指定 asOfDate 取「該日或之前」最新一筆；不指定就是整張表最新一筆。
  getDailyValuation(symbol: string, asOfDate?: Date): Promise<DailyValuationAsOf | null>;
}

export interface LatestDailyPricePort {
  getLatestDailyPrice(symbol: string): Promise<DailyPriceAsOf | null>;
}

export interface DailyPriceSeriesPort {
  // 個股/大盤自 since 起（含）依日期升冪的收盤價；until 有給就只取到 until（含）。
  listDailyClosesSince(symbol: string, since: Date, until?: Date): Promise<DailyCloseRow[]>;
  listTaiexClosesSince(since: Date, until?: Date): Promise<DailyCloseRow[]>;
  // 這檔股票最早的交易日（完全沒有股價資料回 null）。
  getEarliestTradeDate(symbol: string): Promise<Date | null>;
}

// ---- 個股頁面用的歷史序列（GET /stocks/*）——以下 DTO 就是對外回應裡的 entry 形狀，日期一律 YYYY-MM-DD 字串，
// 數字欄位在 repository 內從 Decimal/字串轉成 number | null。對應的 zod schema（OpenAPI 文件）在
// http/modules/stocks/types.ts 用 satisfies 釘住。

export interface DailyPriceHistoryEntry {
  tradeDate: string; // "YYYY-MM-DD"
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface DailyPriceHistory {
  entries: DailyPriceHistoryEntry[]; // 依交易日由舊到新
  earliestAvailableTradeDate: string | null; // 這檔股票全部歷史的最早交易日，不受 limit 影響
}

// 息=純除息、權=純除權、權息=合併發放，是同一筆事件用這個欄位標示類型。
export type ExDividendType = '息' | '權' | '權息';

export interface ExDividendNoticeEntry {
  exDate: string; // "YYYY-MM-DD"，除權息基準日
  exType: ExDividendType;
  stockDividendRatio: number | null;
  subscriptionRatio: number | null;
  subscriptionPricePerShare: number | null;
  cashDividend: number | null;
  sharesOffered: number | null;
  sharesEmpOwner: number | null;
  sharesholderOwner: number | null;
  stockHoldingRatio: number | null;
}

// 2026-09-22 月曆往回翻：status 區分「預告」（twse 預告表，除息日 >= 今天，可能還會改）與「已實現」（mops 股利
// 分派公告，除息日 < 今天，事實）。兩種來源共用同一個 envelope，填不出來的欄位 null：已實現列只有 cashDividend/
// stockDividendRatio（元／股 ÷ 面額換成股／股）對得上，現金增資那幾欄兩邊單位不同（差 10 倍）刻意不對應；
// paymentDate/fiscalYear 只有已實現列有。
export type ExDividendCalendarStatus = 'announced' | 'realized';

// 2026-09-23 ETF 收益分配併進月曆：ETF 不在 mops 的 dividend_distribution 裡（那是上市櫃**公司**的股利分派
// 決議，實測 00 開頭零筆），收益分配走另一條法規途徑、資料在 sitca-ts 的 export.fundclear_etf_dividend。
// 結果是月曆「往前看有 ETF（twse 預告表有）、往回翻沒有」，追月配 ETF 的讀者翻到上個月會以為資料壞了。
// 沿用同一個 envelope＋填不出來的欄位給 null 的慣例，多一個 securityType 讓下游分辨。
export type CalendarSecurityType = 'COMMON' | 'ETF';

// ETF 收益分配的組成拆解（百分比，原樣透傳不做任何評價）。收益平準金佔比在台灣是「配息是不是配到本金」的
// 核心爭議數字，多數免費工具沒有，這是這份月曆真正的差異點。
//
// **null 跟 0 是兩件事，不要合併**：null = 該次配息沒有揭露組成，0 = 有揭露且該項就是零。實測近 24 個月
// 1,965 筆裡 1,783 筆是 0、166 筆 > 0、16 筆 null——資料源本來就分得開，我們原樣傳，不要為了「有值比較好看」
// 把 null 填成 0，下游要靠它分辨「未揭露」與「確實為零」。
export interface EtfDistributionComposition {
  dividendIncomePct: number | null; // 股利所得
  interestIncomePct: number | null; // 利息所得
  incomeEqualizationPct: number | null; // 收益平準金
  realizedCapitalGainPct: number | null; // 已實現資本利得
  otherIncomePct: number | null; // 其他
}

export interface ExDividendCalendarEntry extends ExDividendNoticeEntry {
  symbol: string;
  status: ExDividendCalendarStatus;
  paymentDate: string | null; // 現金股利發放日，"YYYY-MM-DD"，預告列一律 null
  fiscalYear: number | null; // 股利所屬年度（西元），預告列一律 null
  securityType: CalendarSecurityType; // 2026-09-23 新增：ETF 列跟個股列的欄位可用性不同，見下面三個欄位
  recordDate: string | null; // 收益分配基準日，"YYYY-MM-DD"——只有 ETF 列有，個股列一律 null
  distributionPerUnit: number | null; // 每受益權單位分配金額（元）——只有 ETF 列有；個股的每股現金股利仍在 cashDividend
  composition: EtfDistributionComposition | null; // 只有 ETF 列有；個股列一律 null
}

export interface ForeignShareholdingEntry {
  tradeDate: string; // "YYYY-MM-DD"
  sharesHeldPercent: number | null;
  foreignLimitPercent: number | null;
  availableInvestPercent: number | null;
}

export interface StockPledgeRatioEntry {
  reportDate: string; // "YYYY-MM-DD"，TWSE 出表日期，不定期更新
  pledgePercent: number | null;
}

export interface StockHistoryPort {
  // 一次查多家公司的最新股價，查不到的 symbol 不會出現在 Map 裡。
  getLatestDailyPricesBatch(symbols: string[]): Promise<Map<string, DailyPriceAsOf>>;
  // 依交易日新到舊取最近 limit 筆再反轉成舊到新。
  getDailyPriceHistory(symbol: string, limit: number): Promise<DailyPriceHistory>;
  // 只回「今天（含）以後」的除權息預告，查不到的 symbol 不會出現在物件裡。
  getUpcomingExDividendNotices(symbols: string[]): Promise<Record<string, ExDividendNoticeEntry[]>>;
  // 日期區間內全市場的除權息事件（不篩未來），依 exDate、symbol 升冪。
  getExDividendCalendar(startDate: Date, endDate: Date): Promise<ExDividendCalendarEntry[]>;
  // 依日期新到舊取最近 limit 筆。
  getForeignShareholdingHistory(symbol: string, limit: number): Promise<ForeignShareholdingEntry[]>;
  getStockPledgeRatioHistory(symbol: string, limit: number): Promise<StockPledgeRatioEntry[]>;
}

export type MarketDataPort = StockPricePort & MarketCapPort & DailyValuationPort & LatestDailyPricePort & DailyPriceSeriesPort & StockHistoryPort;
