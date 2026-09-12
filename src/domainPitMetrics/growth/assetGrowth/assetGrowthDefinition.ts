import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const assetGrowthDefinition: MetricDefinitionSpec = {
  metricCode: 'assetGrowth',
  name: '總資產成長年增率',
  unit: '%',
  formulaNote:
    '= (本季總資產 - 去年同季總資產) / |去年同季總資產| * 100。去年同季用 getPastNQuarters(' +
    '{rocYear,season},5)[0] 取得，跟 equityGrowthRate/shareCountChangeRate 既有慣例一致。只有' +
    ' Q 一種 basis——資產負債表時點快照，沒有 TTM 概念。',
  formulaLatex: '\\mathrm{AssetGrowth} = \\frac{\\mathrm{Assets}_t - \\mathrm{Assets}_{t-4}}{|\\mathrm{Assets}_{t-4}|} \\times 100',
  academicSourceUrl: 'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.2008.01370.x',
  referenceUrl: 'https://www.quant-investing.com/glossary/asset-growth',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['assets'],
  currentFormulaVersion: 1,
};
