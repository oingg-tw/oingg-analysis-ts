import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

  // MarketRatios 遷入 pitMetrics（見本檔案頂部的方法論說明）：直接沿用 TWSE/TPEx 官方
  // 每日公布數字 passthrough，不自己重算。三支都是 getDailyValuationAsOf 一次查詢寫出來
  // 的（src/domainPitMetrics/shared/marketRatios/computeMarketRatiosPit.ts），snapshotCadence
  // 固定 'EOD'，dependsOn 填來源表欄位名稱（daily_valuation 的欄位），不是財報
  // account_code——這是本 registry 第一批「依賴市場資料而非財報資料」的 metricCode。
export const exchangePeRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'exchangePeRatio',
  name: '本益比',
  nameEn: 'PER',
  nameSuffix: '交易所',
  unit: '倍',
  formulaNote:
    'TWSE/TPEx 官方每日公布的本益比，直接 passthrough export.daily_valuation.pe_ratio，' +
    '本服務不自己重算。交易所的算法是收盤價 ÷ 近滿 4 季稅後純益換算的每股盈餘（2026-09-30 用 2330 反推驗證：' +
    '隱含 EPS 與本服務 eps.TTM 差距在 0.01 元以內，財報申報後約 2～3 個交易日才切換到新一季）——跟自己算的' +
    'pitMetrics peRatio（XBRL EPS TTM、季報知識時點更新）是不同用途、刻意並存的兩組數字，' +
    '不要混用或互相驗證。虧損等無法計算 PER 的情況為 null（missing_input）。',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%9C%AC%E7%9B%8A%E6%AF%94',
  tier: 'raw',
  sources: ['證交所／櫃買中心每日評價指標（本益比／股價淨值比／殖利率）'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['daily_valuation.pe_ratio'],
  currentFormulaVersion: 1,
};
