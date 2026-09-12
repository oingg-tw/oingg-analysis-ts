import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const netWorkingCapitalToAssetsDefinition: MetricDefinitionSpec = {
  metricCode: 'netWorkingCapitalToAssets',
  name: '淨營運資金比率',
  nameEn: 'Net Working Capital to Assets',
  unit: '%',
  formulaNote: '= (本季期末流動資產 − 本季期末流動負債) / 本季期末總資產 * 100。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{NWCToAssets} = \\frac{\\mathrm{CurrentAssets} - \\mathrm{CurrentLiabilities}}{\\mathrm{Assets}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Working_capital',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'current_liabilities', 'assets'],
  currentFormulaVersion: 1,
};
