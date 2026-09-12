import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const payablesTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'payablesTurnover',
  name: '應付帳款週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營業成本/本季期末應付帳款（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營業成本' +
    '加總/本季期末應付帳款。',
  formulaLatex: '\\mathrm{PayablesTurnover} = \\frac{\\mathrm{COGS}}{\\mathrm{AccountsPayable}}',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/accounting/accounts-payable-turnover-ratio',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['operating_costs', 'accountsPayable'],
  currentFormulaVersion: 1,
};
