import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const revenueGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'revenueGrowthRate',
  displayName: '營收成長率（年增）',
  unit: '%',
  formulaNote:
    '= (本季營收 - 去年同季營收) / |去年同季營收| * 100。去年同季用 getPastNQuarters(' +
    '{rocYear,season},5)[0] 取得，跟 shareCountChangeRate/piotroskiFScore 既有慣例一致。只有' +
    ' Q 一種 basis——單季 vs 去年同季是最常見的呈現方式，不疊加 TTM 版本。',
  formulaLatex: '\\mathrm{RevenueGrowthRate} = \\frac{\\mathrm{Revenue}_t - \\mathrm{Revenue}_{t-4}}{|\\mathrm{Revenue}_{t-4}|} \\times 100',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['revenue'],
  currentFormulaVersion: 1,
};
