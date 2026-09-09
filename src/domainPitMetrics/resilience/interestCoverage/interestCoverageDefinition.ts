import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const interestCoverageDefinition: MetricDefinitionSpec = {
  metricCode: 'interestCoverage',
  displayName: '利息保障倍數',
  unit: '倍',
  formulaNote:
    'EBIT = 稅前淨利+利息費用；Q(單季) = EBIT/利息費用（倍）；TTM = 近四季（含本季）EBIT 加總/' +
    '近四季利息費用加總。沒有 Q_ANN——flow/flow 比率年化沒有意義。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_before_tax', 'finance_costs'],
  currentFormulaVersion: 1,
};
