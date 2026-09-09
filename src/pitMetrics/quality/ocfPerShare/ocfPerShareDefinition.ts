import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const ocfPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'ocfPerShare',
  displayName: '每股營業現金流',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季營業活動現金流*1000/流通股數；Q_ANN = Q*4；TTM = 近四季（含本季）營業活動' +
    '現金流加總*1000/流通股數，四季不齊為 null。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'paidInShares'],
  currentFormulaVersion: 1,
};
