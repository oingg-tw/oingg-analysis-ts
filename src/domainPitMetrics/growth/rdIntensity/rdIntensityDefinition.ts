import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const rdIntensityDefinition: MetricDefinitionSpec = {
  metricCode: 'rdIntensity',
  displayName: '研發費用率',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季研發費用/本季營收*100；TTM = 近四季（含本季）加總/近四季營收加總*100。' +
    '研發費用（research_and_development_expense）只存在 XBRL 損益表寬表，沒有舊表 fallback，' +
    '查無整列 XBRL 資料視為缺漏（missing_input），不猜測是「真的沒有研發費用」還是「還沒' +
    '回填」——跟 buybackYield 的 payments_to_acquire_treasury_shares 同一種判斷。G-Score' +
    '（Mohanram 2005）成分之一。沒有 Q_ANN，跟 grossMargin/operatingExpenseRatio 同一種設計。',
  formulaLatex: '\\mathrm{RdIntensity} = \\frac{\\mathrm{RdExpense}}{\\mathrm{Revenue}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/R%26D_intensity',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['research_and_development_expense', 'revenue'],
  currentFormulaVersion: 1,
};
