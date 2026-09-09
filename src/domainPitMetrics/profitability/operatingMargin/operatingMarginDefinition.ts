import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const operatingMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingMargin',
  displayName: '營業利益率',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季營業利益/本季營收*100；TTM = 近四季（含本季）營業利益加總/近四季營收加總*100。' +
    '沒有 Q_ANN。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['operatingIncome', 'revenue'],
  currentFormulaVersion: 1,
};
