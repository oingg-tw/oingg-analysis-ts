import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const revenuePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'revenuePerShare',
  displayName: '每股營收',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季營收*1000/流通股數；Q_ANN = Q*4；TTM = 近四季（含本季）營收加總*1000/流通' +
    '股數，四季不齊為 null。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['revenue', 'paidInShares'],
  currentFormulaVersion: 1,
};
