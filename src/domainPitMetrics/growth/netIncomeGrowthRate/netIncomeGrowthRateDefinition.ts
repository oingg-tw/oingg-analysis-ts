import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const netIncomeGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'netIncomeGrowthRate',
  name: '淨利成長年增率',
  unit: '%',
  formulaNote:
    '= (本季淨利 - 去年同季淨利) / |去年同季淨利| * 100。淨利優先採歸屬母公司口徑，缺漏退回' +
    '整體口徑（比照既有 pickNetIncome 規則）。只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{NetIncomeGrowthRate} = \\frac{\\mathrm{NetIncome}_t - \\mathrm{NetIncome}_{t-4}}{|\\mathrm{NetIncome}_{t-4}|} \\times 100',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/accounting/year-over-year-yoy-analysis/',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss'],
  currentFormulaVersion: 1,
};
