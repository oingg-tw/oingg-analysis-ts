import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const ocfToNetIncomeDefinition: MetricDefinitionSpec = {
  metricCode: 'ocfToNetIncome',
  displayName: '營業現金流對淨利比',
  unit: '倍',
  formulaNote:
    'Q(單季) = 本季營業活動現金流/本季淨利（倍，不是百分比）；TTM = 近四季（含本季）營業活動' +
    '現金流加總/近四季淨利加總。沒有 Q_ANN——flow/flow 比率年化沒有意義（跟 netProfitMargin 同' +
    '一種規則）。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'netCashFromOperatingActivities'],
  currentFormulaVersion: 1,
};
