import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const equityGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'equityGrowthRate',
  name: '淨值成長年增率',
  unit: '%',
  formulaNote:
    '= (本季期末淨值 - 去年同季期末淨值) / |去年同季期末淨值| * 100。淨值優先採歸屬母公司' +
    '口徑，缺漏退回整體口徑（比照既有 pickEquity 規則，見 computeRoePit.ts）。只有 Q 一種' +
    ' basis——資產負債表時點快照，沒有 TTM 概念（跟 bvps/stockPrice 同一種性質）。',
  formulaLatex: '\\mathrm{EquityGrowthRate} = \\frac{\\mathrm{Equity}_t - \\mathrm{Equity}_{t-4}}{|\\mathrm{Equity}_{t-4}|} \\times 100',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/accounting/year-over-year-yoy-analysis/',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
