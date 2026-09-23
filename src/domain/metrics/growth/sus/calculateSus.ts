import type { MetricNullReason } from '@/domain/metrics/metricBasis';

// SUS（Standardized Unexpected Sales，標準化未預期營收）的純計算——依 Jegadeesh & Livnat (2006)
// 《Revenue Surprises and Stock Returns》（Journal of Accounting and Economics 41(1-2), 147-171）
// 的 SURGE 定義。原文式 (6)：
//
//   SURGE_t = (REV_t − E(REV_t)) / ξ_t
//
// 其中 REV 是每股季營收、E(REV) 是公告前的預期值、ξ 是季營收變動的標準差；預期值用**季節性隨機漫步
// 加漂移項**，漂移項與標準差都取前 8 期的季節差分估計，並要求至少前 12 期資料。
//
// **我們的改編（要誠實講，不能寫成「照原文定義」）**：
// 1. **季 → 月**。台灣的月營收強制揭露是本地特有制度（每月 10 日前），國際文獻用的是季營收。季節週期
//    因此從 4 變成 12：季節差分是「跟去年同月比」而不是「跟去年同季比」。
// 2. **每股 → 金額**。原文用每股營收（REV per share）。用金額可以避開股本變動（增資、減資、庫藏股）
//    污染序列——這跟我們既有的 sue 從 EPS 改用淨利金額是同一個取捨，理由一致。
//
// 前 8 期與要求 12 期這兩個參數**照原文不動**：8 個季節差分（除以 7 = 樣本標準差的自由度）是原文
// 式 (5) 的估計量，改成別的期數就不是那個估計量了。
//
// 所需資料：目標月 t、t−12（季節基期）、以及 j=1..8 的 t−j 與 t−j−12 ——最舊要到 t−20。
// 實作上要求 t−20 … t 這 21 個月**連續無缺**：不用較少期數頂替（跟 sue/CAGR 家族同一個慣例，
// 窗口變短數字就失真），任一月缺漏一律 insufficient_history。
export const SUS_SEASONAL_LAG = 12; // 季節週期（月）
export const SUS_DIFF_COUNT = 8; // 取幾個季節差分估計漂移項與標準差（照原文）
export const SUS_WINDOW_MONTHS = SUS_SEASONAL_LAG + SUS_DIFF_COUNT + 1; // 21：t−20 … t

export interface SusResult {
  value: number | null;
  nullReason: MetricNullReason | null;
}

// revenues：由舊到新、連續無缺月的營收序列，長度必須正好 SUS_WINDOW_MONTHS，最後一筆是目標月 t。
// 任一筆為 null（該月查無資料）→ insufficient_history。
export const calculateSus = (revenues: (number | null)[]): SusResult => {
  if (revenues.length !== SUS_WINDOW_MONTHS || revenues.some((r) => r === null)) {
    return { value: null, nullReason: 'insufficient_history' };
  }
  const r = revenues as number[];
  const t = r.length - 1; // 目標月在陣列裡的索引

  // 季節差分 d_j = R_{t−j} − R_{t−j−12}，j = 1..8。
  const diffs: number[] = [];
  for (let j = 1; j <= SUS_DIFF_COUNT; j++) {
    diffs.push(r[t - j]! - r[t - j - SUS_SEASONAL_LAG]!);
  }

  const drift = diffs.reduce((sum, d) => sum + d, 0) / SUS_DIFF_COUNT;
  // 樣本標準差（除以 n−1 = 7），跟原文式 (5) 一致。
  const variance = diffs.reduce((sum, d) => sum + (d - drift) ** 2, 0) / (SUS_DIFF_COUNT - 1);
  const sigma = Math.sqrt(variance);

  // σ = 0 代表過去 8 個季節差分完全相同（實務上是營收長期為 0 或完全等差），這時「意外」沒有尺規可量。
  if (sigma === 0) return { value: null, nullReason: 'zero_or_negative_denominator' };

  const expected = r[t - SUS_SEASONAL_LAG]! + drift;
  return { value: (r[t]! - expected) / sigma, nullReason: null };
};
