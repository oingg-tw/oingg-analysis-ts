import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const payablesTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'payablesTurnover',
  name: '應付帳款週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營業成本/平均應付帳款（次）；TTM = 近四季（含本季）營業成本' +
    '加總/平均應付帳款。（2026-09-22 formulaVersion 2：分母改期間平均——Q 取本季與上季期末兩點、TTM 取近四季窗口 5 個季末的平均，理由見 application/metrics/shared/averageBalances.ts；v1 用本季單一期末值。）',
  formulaLatex: '\\mathrm{PayablesTurnover} = \\frac{\\mathrm{COGS}}{\\overline{\\mathrm{AccountsPayable}}}',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/accounting/accounts-payable-turnover-ratio',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['operating_costs', 'accountsPayable'],
  currentFormulaVersion: 2,
};
