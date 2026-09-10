import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const cashRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'cashRatio',
  displayName: '現金比率',
  unit: '%',
  formulaNote: '= 本季期末現金及約當現金/本季期末流動負債*100。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{CashRatio} = \\frac{\\mathrm{Cash}}{\\mathrm{CurrentLiabilities}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Cash_ratio',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['cash_and_cash_equivalents', 'current_liabilities'],
  currentFormulaVersion: 1,
};
