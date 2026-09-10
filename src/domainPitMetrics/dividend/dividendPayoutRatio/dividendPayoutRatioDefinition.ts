import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const dividendPayoutRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendPayoutRatio',
  displayName: '盈餘發放率',
  unit: '%',
  formulaNote:
    'TTM = |近四季（含本季）股利發放加總| / 近四季淨利加總 * 100，淨利優先採歸屬母公司口徑，' +
    '淨利須為正才有意義（≤0 視為 zero_or_negative_denominator）。沒有 Q/Q_ANN——股利通常一年' +
    '發放 1-2 次，單季配息率會嚴重失真（跟 src/domainMetrics/dividendPayoutRatio.ts 現有規則一致）。',
  formulaLatex: '\\mathrm{DividendPayoutRatio} = \\frac{\\left|\\sum_{i=1}^{4}\\mathrm{DividendsPaid}_i\\right|}{\\sum_{i=1}^{4}\\mathrm{NetIncome}_i} \\times 100',
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'dividendsPaid'],
  currentFormulaVersion: 1,
};
