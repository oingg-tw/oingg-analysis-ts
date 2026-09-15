import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankNetInterestIncomePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'bankNetInterestIncomePerShare',
  name: '每股利息淨收益',
  nameEn: 'Net Interest Income Per Share',
  unit: '元',
  formulaNote:
    '銀行業「營收到股利去了哪裡」瀑布圖第一段——Q(單季) = 本季利息淨收益' +
    '（利息收入減利息費用後的淨額，官方單一欄位，不是本服務自己拆利息收入/支出相減）' +
    '*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。只對' +
    '銀行/金控（mops-ts export.bank_income_statement_detail_xbrl 有申報者，2026-09-15' +
    '實測約10-11家）有資料，非銀行公司從未寫入任何一列（不是這一季算不出來）。',
  formulaLatex: '\\mathrm{BankNetInterestIncomePerShare} = \\frac{\\mathrm{NetInterestIncome}}{\\mathrm{Shares}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Net_interest_income',
  tier: 'derived',
  sources: ['公開發行公司銀行業損益表明細（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['net_income_loss_of_interest', 'paidInShares'],
  currentFormulaVersion: 1,
};
