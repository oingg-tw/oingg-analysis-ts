import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const netIncomeGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'netIncomeGrowthRate',
  displayName: '淨利成長率（年增）',
  unit: '%',
  formulaNote:
    '= (本季淨利 - 去年同季淨利) / |去年同季淨利| * 100。淨利優先採歸屬母公司口徑，缺漏退回' +
    '整體口徑（比照既有 pickNetIncome 規則）。只有 Q 一種 basis。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss'],
  currentFormulaVersion: 1,
};
