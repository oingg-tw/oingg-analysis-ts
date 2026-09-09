import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const operatingIncomeGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingIncomeGrowthRate',
  displayName: '營業利益成長率（年增）',
  unit: '%',
  formulaNote: '= (本季營業利益 - 去年同季營業利益) / |去年同季營業利益| * 100。只有 Q 一種 basis。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_from_operating_activities'],
  currentFormulaVersion: 1,
};
