import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const currentRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'currentRatio',
  displayName: '流動比率',
  unit: '%',
  formulaNote: '= 本季期末流動資產/本季期末流動負債*100。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{CurrentRatio} = \\frac{\\mathrm{CurrentAssets}}{\\mathrm{CurrentLiabilities}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%B5%81%E5%8B%95%E6%AF%94%E7%8E%87',
  tier: 'derived',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'current_liabilities'],
  currentFormulaVersion: 1,
};
