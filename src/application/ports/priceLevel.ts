// 2026-09-22：Ohlson (1980) O-Score 的 SIZE 變數是 log(總資產 ÷ GNP 物價指數)，總資產以美元千元計、指數以 1968 年 = 100
// 為基期。本站 v1 直接 ln(新台幣千元總資產)，幣別＋物價差讓 SIZE 高約 4–5、O-score 全市場系統性低約 2（看起來都很安全）。
// 使用者拍板照原文換算：總資產 × 美元匯率（gov-ts export.daily_usd_twd_rate）÷（GNPDEF_q ÷ GNPDEF_1968 平均 × 100）。
// 兩個資料都由 gov-ts 提供：GNPDEF 是 FRED 季頻（2017=100，每月 5 日整批重建含修正值），匯率序列落後約一個月，
// 財報季底比它新時取最近可得的一天。
export interface PriceLevelPort {
  // 銀行間收盤匯率（1 美元兌新台幣），asOf 當天或之前最近一筆；查無回 null。
  getUsdTwdRateAsOf(asOf: Date): Promise<number | null>;
  // FRED GNPDEF 原值（2017=100），查無該季回 null。
  getUsGnpDeflator(year: number, quarter: number): Promise<number | null>;
  // 1968 年四季的 GNPDEF 平均（Ohlson 的基期），查無回 null。
  getUsGnpDeflatorBase1968(): Promise<number | null>;
}
