import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const assetTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'assetTurnover',
  displayName: '總資產週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營收/本季期末總資產（次）；Q_ANN = Q*4（簡易年化）；' +
    'TTM = 近四季（含本季）營收加總/本季期末總資產，四季不齊為 null。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['revenue', 'assets'],
  currentFormulaVersion: 1,
};
