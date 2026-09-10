import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const ownerEarningsDefinition: MetricDefinitionSpec = {
  metricCode: 'ownerEarnings',
  displayName: '業主盈餘',
  unit: '元',
  formulaNote:
    '每股股東盈餘 = (本季淨利+折舊+攤銷+資本支出)/流通股數（資本支出來源資料是負值/流出，' +
    '用加法）。Q(單季)/Q_ANN(=Q*4)/TTM（近四季各分項各自加總再除以流通股數），跟 eps/' +
    'revenuePerShare 同形狀。',
  formulaLatex: '\\mathrm{OwnerEarnings} = \\frac{\\mathrm{NetIncome} + \\mathrm{Depreciation} + \\mathrm{Amortization} + \\mathrm{Capex}}{\\mathrm{Shares}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Owner_earnings',
  tier: 'derived',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'depreciation',
    'amortization',
    'capitalExpenditures',
    'paidInShares',
  ],
  currentFormulaVersion: 1,
};
