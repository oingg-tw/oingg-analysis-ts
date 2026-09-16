import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const interestCoverageDefinition: MetricDefinitionSpec = {
  metricCode: 'interestCoverage',
  name: '利息保障倍數',
  unit: '倍',
  formulaNote:
    'EBIT = 稅前淨利+利息費用；Q(單季) = EBIT/利息費用（倍）；TTM = 近四季（含本季）EBIT 加總/' +
    '近四季利息費用加總。沒有 Q_ANN——flow/flow 比率年化沒有意義。',
  formulaLatex: '\\mathrm{InterestCoverage} = \\frac{\\mathrm{EBIT}}{\\mathrm{InterestExpense}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E5%88%A9%E6%81%AF%E4%BF%9D%E9%9A%9C%E5%80%8D%E6%95%B8',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_before_tax', 'finance_costs'],
  currentFormulaVersion: 1,
};
