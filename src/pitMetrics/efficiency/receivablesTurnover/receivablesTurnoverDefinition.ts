import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const receivablesTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'receivablesTurnover',
  displayName: '應收帳款週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營收/本季期末應收帳款（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營收加總/' +
    '本季期末應收帳款。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['revenue', 'accountsReceivable'],
  currentFormulaVersion: 1,
};
