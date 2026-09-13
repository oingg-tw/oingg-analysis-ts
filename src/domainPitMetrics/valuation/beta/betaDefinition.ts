import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 2026-09-08 獨立重新實作 src/domainMetrics/beta.ts（不呼叫舊架構，同一套公式跟降頻
  // 邏輯）：Beta = Cov(個股報酬率, 加權股價指數報酬率) / Var(加權股價指數報酬率)。
  // 舊架構是「一列存三個窗口」，這裡改成「一個 metricCode，三個 (lookbackRange,
  // samplingInterval) 組合各自一列」（1Y×1D/2Y×1W/5Y×1M），因為三個窗口是同一個概念
  // （系統性風險係數）在不同取樣頻率下的版本，不是三個不同概念——用這兩個正交欄位表達，
  // 不是拆成三個 metricCode。dependsOn 填來源表欄位，不是財報 account_code，是市場資料
  // 而非財報資料。分類上歸 valuation（Beta 是 CAPM/貼現率的輸入，跟經營/財務風險模型如
  // altmanZScore 是不同概念，2026-09-08 使用者確認：「beta 不反映經營風險」）。
export const betaDefinition: MetricDefinitionSpec = {
  metricCode: 'beta',
  name: 'Beta',
  unit: '無單位',
  formulaNote:
    'Cov(個股報酬率, 加權股價指數報酬率) / Var(加權股價指數報酬率)，樣本共變異數/變異數' +
    '（分母 n-1）。三個 (lookbackRange, samplingInterval) 組合各自獨立計算（各自取基準' +
    '交易日往前 N 年的重疊交易日再降頻，不是用短窗口的資料湊長窗口）：1Y×1D 用日資料、' +
    '2Y×1W 用週資料（對齊 Bloomberg）、5Y×1M 用月資料（對齊 Morningstar/S&P），降頻取' +
    '「每個週期最後一個重疊交易日」代表。降頻後取樣點數 < 20 為 insufficient_history；' +
    '指數變異數為 0（理論上不會發生但防呆）為 zero_or_negative_denominator。基準日 =' +
    '個股股價與加權指數都有資料的最新重疊交易日。',
  formulaLatex: '\\mathrm{Beta} = \\frac{\\mathrm{Cov}_{\\mathrm{StockIndex}}}{\\mathrm{Var}_{\\mathrm{Index}}}',
  academicSourceUrl: 'https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1964.tb02865.x',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%B2%9D%E4%BB%96%E4%BF%82%E6%95%B8',
  tier: 'composite',
  sources: ['證交所／櫃買中心每日收盤價', '加權股價指數（TAIEX）每日收盤價'],
  group: 'rollingWindow',
  allowedLookbackRanges: ['1Y', '2Y', '5Y'],
  allowedSamplingIntervals: ['1D', '1W', '1M'],
  // allowedLookbackRanges x allowedSamplingIntervals 上面兩欄不是自由交叉組合（3x3=9），
  // 三個窗口各自綁定固定的取樣頻率（1Y 用日頻、2Y 用週頻、5Y 用月頻，理由見上面
  // formulaNote），只有這 3 種組合真的會寫入資料——這個陣列是外部消費端（GET /metrics、
  // screener/companies 端點的 timeframe 驗證）唯一該信任的合法組合來源，2026-09-08 bff-ts
  // 拿真實資料實測 9 種組合才發現另外 6 種「查得到但永遠是空結果」，回報後補上。
  allowedRollingWindowTimeframes: ['1Y_1D', '2Y_1W', '5Y_1M'],
  dependsOn: ['daily_price.close', 'daily_taiex_index.close'],
  currentFormulaVersion: 1,
};
