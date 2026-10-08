import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const revenueGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'revenueGrowthRate',
  name: '營收成長年增率',
  unit: '%',
  formulaNote:
    '= (本季營收 - 去年同季營收) / |去年同季營收| * 100。去年同季用 getPastNQuarters(' +
    '{rocYear,season},5)[0] 取得，跟 shareCountChangeRate/piotroskiFScore 既有慣例一致。只有' +
    ' Q 一種 basis——單季 vs 去年同季是最常見的呈現方式。' +
    '（2026-10-05 新增）TTM = 近四季營收加總 vs 去年同期近四季加總；FY = 年報全年營收 vs 上一年度年報（座標該年度第四季）。溯源表是單季。',
  formulaLatex: '\\mathrm{RevenueGrowthRate} = \\frac{\\mathrm{Revenue}_t - \\mathrm{Revenue}_{t-4}}{|\\mathrm{Revenue}_{t-4}|} \\times 100',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/accounting/quarterly-revenue-growth/',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '銀行業損益表明細（XBRL，銀行適用）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  provenancePeriodType: 'Q',
  dependsOn: ['revenue'],
  currentFormulaVersion: 1,
};
