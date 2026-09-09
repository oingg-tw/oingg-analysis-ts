import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankCet1RatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankCet1Ratio',
  displayName: '銀行普通股權益第一類資本比率 (CET1)',
  unit: '%',
  formulaNote: '普通股權益比率（CET1），直接讀 bank_capital_adequacy_detail_xbrl 已經算好的 ratio_ordinary_share_equity_to_rwa，覆蓋率/頻率限制同 bankCarRatio。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['ratioOrdinaryShareEquityToRwa'],
  currentFormulaVersion: 1,
};
