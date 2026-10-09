import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-09 新增：負債比率拆分的另一半，背景見 currentLiabilitiesToAssetsDefinition.ts。
export const nonCurrentLiabilitiesToAssetsDefinition: MetricDefinitionSpec = {
  metricCode: 'nonCurrentLiabilitiesToAssets',
  name: '非流動負債占總資產比',
  unit: '%',
  notApplicableToFinancialIndustry: true,
  formulaNote: '= 本季期末非流動負債/本季期末總資產*100。純資產負債表時點快照，只有 Q；跟 currentLiabilitiesToAssets 相加等於 debtRatio。',
  formulaLatex: '\\mathrm{NonCurrentLiabilitiesToAssets} = \\frac{\\mathrm{NonCurrentLiabilities}}{\\mathrm{TotalAssets}} \\times 100',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['noncurrent_liabilities', 'assets'],
  currentFormulaVersion: 1,
};
