import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const ownerEarningsDefinition: MetricDefinitionSpec = {
  metricCode: 'ownerEarnings',
  name: '業主盈餘',
  unit: '元',
  perShare: true,
  formulaNote:
    '每股股東盈餘 = (本季淨利+折舊+攤銷+資本支出)/流通股數（資本支出來源資料是負值/流出，' +
    '用加法）。Q(單季)/TTM（近四季各分項各自加總再除以流通股數），跟 eps/' +
    'revenuePerShare 同形狀。（2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股，已發行 − 特別股 − 庫藏股。）',
  formulaLatex: '\\mathrm{OwnerEarnings} = \\frac{\\mathrm{NetIncome} + \\mathrm{Depreciation} + \\mathrm{Amortization} + \\mathrm{Capex}}{\\mathrm{Shares}}',
  academicSourceUrl: 'https://www.berkshirehathaway.com/letters/1986.html',
  referenceUrl: 'https://en.wikipedia.org/wiki/Owner_earnings',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'depreciation',
    'amortization',
    'capitalExpenditures',
    'outstandingCommonShares',
  ],
  currentFormulaVersion: 2,
};
