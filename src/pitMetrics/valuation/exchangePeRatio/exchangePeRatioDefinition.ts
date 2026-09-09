import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

  // MarketRatios 遷入 pitMetrics（見本檔案頂部的方法論說明）：直接沿用 TWSE/TPEx 官方
  // 每日公布數字 passthrough，不自己重算。三支都是 getDailyValuationAsOf 一次查詢寫出來
  // 的（src/pitMetrics/shared/marketRatios/computeMarketRatiosPit.ts），snapshotCadence
  // 固定 'EOD'，dependsOn 填來源表欄位名稱（daily_valuation 的欄位），不是財報
  // account_code——這是本 registry 第一批「依賴市場資料而非財報資料」的 metricCode。
export const exchangePeRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'exchangePeRatio',
  displayName: '本益比（交易所公告）',
  unit: '倍',
  formulaNote:
    'TWSE/TPEx 官方每日公布的本益比，直接 passthrough export.daily_valuation.pe_ratio，' +
    '本服務不自己重算，不知道交易所用的 EPS 是單季/TTM/年度哪種口徑——跟自己算的' +
    'pitMetrics peRatio（XBRL EPS TTM、季報知識時點更新）是不同用途、刻意並存的兩組數字，' +
    '不要混用或互相驗證。虧損等無法計算 PER 的情況為 null（missing_input）。',
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['daily_valuation.pe_ratio'],
  currentFormulaVersion: 1,
};
