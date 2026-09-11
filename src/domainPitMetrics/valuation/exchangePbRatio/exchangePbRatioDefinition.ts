import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const exchangePbRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'exchangePbRatio',
  displayName: '交易所 PBR',
  unit: '倍',
  formulaNote:
    'TWSE/TPEx 官方每日公布的股價淨值比，直接 passthrough export.daily_valuation.pb_ratio，' +
    '本服務不自己重算——跟自己算的 pitMetrics pbRatio（XBRL BVPS、季報知識時點更新）是' +
    '不同用途、刻意並存的兩組數字，不要混用或互相驗證。',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E5%83%B9%E6%B7%A8%E5%80%BC%E6%AF%94',
  tier: 'raw',
  sources: ['證交所／櫃買中心每日評價指標（本益比／股價淨值比／殖利率）'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['daily_valuation.pb_ratio'],
  currentFormulaVersion: 1,
};
