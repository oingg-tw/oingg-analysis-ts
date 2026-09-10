import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const netDebtToEbitdaDefinition: MetricDefinitionSpec = {
  metricCode: 'netDebtToEbitda',
  displayName: '淨負債對 EBITDA 比',
  unit: '倍',
  formulaNote:
    '淨負債 = 有息負債(短期借款+應付公司債+長期借款) - 現金及約當現金；EBITDA = 稅前淨利+利息費用' +
    '+折舊+攤銷；Q_ANN = 淨負債/(本季 EBITDA*4)；TTM = 淨負債/近四季（含本季）EBITDA 加總。' +
    '只有 Q_ANN/TTM 兩種 basis——跟舊架構一致，taxonomy 只支援這兩種（store/flow 比率），沒有' +
    '單季非年化版本。',
  formulaLatex:
    '\\mathrm{NetDebtToEbitda} = \\frac{\\mathrm{NetDebt}}{\\mathrm{EBITDA}},\\quad \\mathrm{NetDebt} = \\mathrm{InterestBearingDebt} - \\mathrm{Cash}',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
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
  currentFormulaVersion: 1,
};
