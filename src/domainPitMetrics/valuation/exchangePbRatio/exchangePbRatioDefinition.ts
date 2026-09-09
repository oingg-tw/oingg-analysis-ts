import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const exchangePbRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'exchangePbRatio',
  displayName: '股價淨值比（交易所公告）',
  unit: '倍',
  formulaNote:
    'TWSE/TPEx 官方每日公布的股價淨值比，直接 passthrough export.daily_valuation.pb_ratio，' +
    '本服務不自己重算——跟自己算的 pitMetrics pbRatio（XBRL BVPS、季報知識時點更新）是' +
    '不同用途、刻意並存的兩組數字，不要混用或互相驗證。',
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['daily_valuation.pb_ratio'],
  currentFormulaVersion: 1,
};
