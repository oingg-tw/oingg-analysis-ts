import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const currentRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'currentRatio',
  displayName: '流動比率',
  unit: '%',
  formulaNote: '= 本季期末流動資產/本季期末流動負債*100。純資產負債表時點快照，只有 Q 一種 basis。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'current_liabilities'],
  currentFormulaVersion: 1,
};
