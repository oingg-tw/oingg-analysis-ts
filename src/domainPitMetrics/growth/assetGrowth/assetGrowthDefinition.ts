import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const assetGrowthDefinition: MetricDefinitionSpec = {
  metricCode: 'assetGrowth',
  displayName: '總資產成長率（年增）',
  unit: '%',
  formulaNote:
    '= (本季總資產 - 去年同季總資產) / |去年同季總資產| * 100。去年同季用 getPastNQuarters(' +
    '{rocYear,season},5)[0] 取得，跟 equityGrowthRate/shareCountChangeRate 既有慣例一致。只有' +
    ' Q 一種 basis——資產負債表時點快照，沒有 TTM 概念。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['assets'],
  currentFormulaVersion: 1,
};
