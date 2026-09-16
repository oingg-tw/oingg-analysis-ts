import type { LookbackRange, SamplingInterval } from './metricBasis';

// 2026-09-14 web-nuxt 轉達使用者需求：股票詳情頁 Beta 卡片要直接顯示係數數值，不只是
// 對照走勢圖。GET /companies/beta 一次回傳四個滾動視窗（1Y_1D/2Y_1W/3Y_1W/5Y_1M，
// 2026-09-15 新增 3Y_1W）各自最新一筆，不做歷史累積。⚠️ 新增視窗要先知會 bff-ts（他們的嚴格
// 校驗會把陌生的 timeframe 當 502，見 feedback_notify_downstream_fixed_window_changes）。
export interface BetaWindow {
  timeframe: string;
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
}

export const BETA_WINDOWS: readonly BetaWindow[] = [
  { timeframe: '1Y_1D', lookbackRange: '1Y', samplingInterval: '1D' },
  { timeframe: '2Y_1W', lookbackRange: '2Y', samplingInterval: '1W' },
  { timeframe: '3Y_1W', lookbackRange: '3Y', samplingInterval: '1W' },
  { timeframe: '5Y_1M', lookbackRange: '5Y', samplingInterval: '1M' },
];
