import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const inventoryTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'inventoryTurnover',
  displayName: '存貨週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營業成本/本季期末存貨（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營業成本' +
    '加總/本季期末存貨。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['operating_costs', 'inventories'],
  currentFormulaVersion: 1,
};
