import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const dupontInterestBurdenDefinition: MetricDefinitionSpec = {
  metricCode: 'dupontInterestBurden',
  displayName: '利息負擔',
  unit: '%',
  formulaNote: 'Q(單季) = 本季稅前淨利/本季EBIT*100（EBIT=稅前淨利+財務費用）；TTM = 近四季稅前淨利加總/近四季EBIT加總*100。',
  formulaLatex: '\\mathrm{InterestBurden} = \\frac{\\mathrm{PretaxIncome}}{\\mathrm{EBIT}} \\times 100',
  // 沒有專屬條目，英文 DuPont analysis 條目內文定義 Interest Burden = EBT/EBIT。
  referenceUrl: 'https://en.wikipedia.org/wiki/DuPont_analysis',
  tier: 'derived',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_before_tax', 'finance_costs'],
  currentFormulaVersion: 1,
};
