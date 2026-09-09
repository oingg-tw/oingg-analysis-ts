import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const capexToRevenueDefinition: MetricDefinitionSpec = {
  metricCode: 'capexToRevenue',
  displayName: '資本支出佔營收比',
  unit: '%',
  formulaNote:
    'Q(單季) = |資本支出|/本季營收*100；TTM = |近四季（含本季）資本支出加總|/近四季營收加總*100。' +
    '沒有 Q_ANN——flow/flow 比率年化沒有意義。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['revenue', 'capitalExpenditures'],
  currentFormulaVersion: 1,
};
