import type { MetricStatus } from '../../../shared/metricStatus';

export interface BetaQuery {
  companyId: string;
  // 選填，格式 YYYY-MM-DD；不給就抓「股價跟指數都有資料的最新一個重疊交易日」。
  // 逐日市場資料，跟其他指標的 year/season 是不同的查詢介面，跟 marketRatios/ 同一種模式。
  asOfDate?: string;
}

export type BetaSamplingFrequency = 'daily' | 'weekly' | 'monthly';

export interface BetaWindow {
  value: number | null;
  samplingFrequency: BetaSamplingFrequency;
  windowStart: string | null; // 這個窗口實際用到的最早取樣點日期（降頻後的重疊交易日，不是理論上的 asOfDate - N 年）
  windowEnd: string | null;
  observations: number; // 降頻後的取樣點數（daily 就是重疊交易日數，weekly/monthly 是各週/月最後一個重疊交易日的數量）；報酬率樣本數 = observations - 1
}

export interface BetaResult {
  companyId: string;
  // 實際使用的基準日——股價跟指數都有資料的最新（或指定日期之前最近）一個重疊交易日。
  asOfDate: string | null;

  // Beta = Cov(個股報酬率, 加權股價指數報酬率) / Var(加權股價指數報酬率)。
  // 三個窗口獨立計算（各自取 asOfDate 往前 N 年的重疊交易日再降頻），不是用短窗口的資料去湊長窗口。
  // 2026-08-26 起改成三個窗口不同取樣頻率（1Y 日、2Y 週、5Y 月），對齊 Bloomberg（2Y 用週）、
  // Yahoo Finance（5Y 用月）常見做法——長窗口用日資料會把雜訊/非同步交易的短期波動也算進長期
  // 結構性風險，不是業界慣例，見 src/domains/portfolio/README.md「Beta 計算口徑」的說明。
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
