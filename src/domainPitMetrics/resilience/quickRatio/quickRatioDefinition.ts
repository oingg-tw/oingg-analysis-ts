import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const quickRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'quickRatio',
  displayName: '速動比率',
  unit: '%',
  formulaNote: '= (本季期末流動資產-存貨)/本季期末流動負債*100。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{QuickRatio} = \\frac{\\mathrm{CurrentAssets} - \\mathrm{Inventory}}{\\mathrm{CurrentLiabilities}} \\times 100',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'current_liabilities', 'inventories'],
  currentFormulaVersion: 1,
};
