import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const netDebtToEbitdaDefinition: MetricDefinitionSpec = {
  metricCode: 'netDebtToEbitda',
  name: '淨負債對息稅折舊攤銷前盈餘比',
  nameEn: 'Net Debt/EBITDA',
  unit: '倍',
  formulaNote:
    '淨負債 = 有息負債(短期借款+應付短期票券+一年內到期長期負債+應付公司債+長期借款) + 租賃負債 + 淨確定福利負債×(1-20%) - 現金及約當現金（S&P 調整後負債；S&P 只扣剩餘現金，財報無法判斷，這裡扣全部現金）；EBITDA = 稅前淨利+利息費用' +
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
  dependsOn: ['current_cp_issued_and_portion', 'longterm_liabilities_current_portion', 'current_lease_liabilities', 'noncurrent_lease_liabilities', 'noncurrent_liabilities_defined_benefit', 
    'shortTermBorrowings',
    'bondsPayable',
    'longterm_borrowings',
    'cash_and_cash_equivalents',
    'profit_loss_before_tax',
    'finance_costs',
    'depreciation',
    'amortization',
  ],
  currentFormulaVersion: 3,
};
