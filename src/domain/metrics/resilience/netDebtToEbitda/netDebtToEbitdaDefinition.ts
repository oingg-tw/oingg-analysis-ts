import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const netDebtToEbitdaDefinition: MetricDefinitionSpec = {
  metricCode: 'netDebtToEbitda',
  name: '淨負債對 EBITDA 比',
  unit: '倍',
  formulaNote:
    '淨負債 = 有息負債(短期借款+應付公司債+長期借款) - 現金及約當現金；EBITDA = 稅前淨利+利息費用' +
    '+折舊+攤銷；TTM = 淨負債/近四季（含本季）EBITDA 加總。' +
    '只有 TTM 一種 basis——store/flow 比率沒有單季非年化版本。EBITDA ≤ 0 不計算（zero_or_negative_denominator，' +
    'formulaVersion 2 起；負 EBITDA 的倍數在信評慣例裡不具意義）。',
  formulaLatex:
    '\\mathrm{NetDebtToEbitda} = \\frac{\\mathrm{NetDebt}}{\\mathrm{EBITDA}},\\quad \\mathrm{NetDebt} = \\mathrm{InterestBearingDebt} - \\mathrm{Cash}',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/valuation/net-debt-ebitda-ratio/',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'shortTermBorrowings',
    'bondsPayable',
    'longterm_borrowings',
    'cash_and_cash_equivalents',
    'profit_loss_before_tax',
    'finance_costs',
    'depreciation',
    'amortization',
  ],
  currentFormulaVersion: 2,
};
