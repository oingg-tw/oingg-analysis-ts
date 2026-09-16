import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const bankNetNonInterestIncomePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'bankNetNonInterestIncomePerShare',
  name: '每股非利息淨收益',
  nameEn: 'Net Non-Interest Income Per Share',
  unit: '元',
  formulaNote:
    '銀行業「營收到股利去了哪裡」瀑布圖第二段——Q(單季) = 本季非利息淨收益' +
    '（手續費、投資損益、匯兌損益等全部非利息項目加總後的官方單一淨額欄位）' +
    '*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。' +
    '跟 bankNetInterestIncomePerShare 相加即為銀行損益表的「淨收益」中間小計（已跟' +
    'mops-ts 交叉驗證：2801 114Q2 兩者加總精確等於官方 net_income 欄位）。只對銀行/' +
    '金控有資料，非銀行公司從未寫入任何一列。',
  formulaLatex: '\\mathrm{BankNetNonInterestIncomePerShare} = \\frac{\\mathrm{NetNonInterestIncome}}{\\mathrm{Shares}}',
  tier: 'derived',
  sources: ['公開發行公司銀行業損益表明細（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['net_non_interest_income_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
