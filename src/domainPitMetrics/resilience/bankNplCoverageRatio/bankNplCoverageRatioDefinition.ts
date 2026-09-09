import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankNplCoverageRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankNplCoverageRatio',
  displayName: '銀行備抵呆帳覆蓋率',
  unit: '%',
  formulaNote:
    '備抵呆帳覆蓋率，跟 bankNplRatio 同一列（bank_asset_quality_xbrl 的 TotalLoans）、' +
    '同一次查詢、同一組 knowledge_date，直接讀已經算好的 coverage_ratio。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['coverageRatio'],
  currentFormulaVersion: 1,
};
