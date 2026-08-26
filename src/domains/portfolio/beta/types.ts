import type { MetricStatus } from '../../../shared/metricStatus';

export interface BetaQuery {
  companyId: string;
  // 選填，格式 YYYY-MM-DD；不給就抓「股價跟指數都有資料的最新一個重疊交易日」。
  // 逐日市場資料，跟其他指標的 year/season 是不同的查詢介面，跟 marketRatios/ 同一種模式。
  asOfDate?: string;
}

export interface BetaWindow {
  value: number | null;
  windowStart: string | null; // 這個窗口實際用到的最早交易日（重疊交易日，不是理論上的 asOfDate - N 年）
  windowEnd: string | null;
  observations: number; // 重疊交易日數；報酬率樣本數 = observations - 1
}

export interface BetaResult {
  companyId: string;
  // 實際使用的基準日——股價跟指數都有資料的最新（或指定日期之前最近）一個重疊交易日。
  asOfDate: string | null;

  // Beta = Cov(個股日報酬率, 加權股價指數日報酬率) / Var(加權股價指數日報酬率)。
  // 三個窗口獨立計算（各自取 asOfDate 往前 N 年的重疊交易日），不是用短窗口的資料去湊長窗口。
  beta1Y: BetaWindow;
  beta2Y: BetaWindow;
  beta5Y: BetaWindow;

  dataCoverage: {
    stockPriceDateRange: { min: string | null; max: string | null }; // 這個 symbol 在 daily_stock_price 的資料範圍；查無資料則兩者皆 null
    marketIndexDateRange: { min: string | null; max: string | null }; // daily_market_index 整體資料範圍，跟 symbol 無關
  };

  // 2026-08-26 起新指標統一用這個規範標註「值為 null 的原因」，見 src/shared/metricStatus.ts；
  // 只列出值為 null 的欄位（beta1Y/beta2Y/beta5Y 三個 key 分別對應），沒列出的代表正常算出來了。
  fieldStatuses: Record<string, MetricStatus>;

  warnings: string[];
}
