import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const bankOtherOperatingExpensePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'bankOtherOperatingExpensePerShare',
  name: '每股其他營業費用',
  nameEn: 'Other Operating Expenses Per Share',
  unit: '元',
  formulaNote:
    '銀行業「營收到股利去了哪裡」瀑布圖最後一段扣減項——用殘差法算出：' +
    '（利息淨收益+非利息淨收益）− 呆帳費用及保證責任準備 − 稅前淨利。這裡沒有對應的' +
    '官方單一總計欄位可以直接讀（銀行損益表底下人事/管理/租金等營業費用科目太細碎，' +
    '逐項列舉相加對不起來官方數字的風險已在其他銀行指標驗證時真實發生過），用殘差法' +
    '保證瀑布圖「淨收益－呆帳費用－其他營業費用＝稅前淨利」這條式子恆成立，不會有加總' +
    '兜不起來的情況。Q(單季) = 本季殘差*1000/流通股數；TTM = 近四季（含本季）加總*1000/' +
    '流通股數，四季不齊為 null。只對銀行/金控有資料，非銀行公司從未寫入任何一列。',
  formulaLatex: '\\mathrm{BankOtherOperatingExpensePerShare} = \\frac{(\\mathrm{NetInterestIncome}+\\mathrm{NetNonInterestIncome})-\\mathrm{BadDebtProvision}-\\mathrm{ProfitBeforeTax}}{\\mathrm{Shares}}',
  tier: 'derived',
  sources: ['公開發行公司銀行業損益表明細（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['net_income_loss_of_interest', 'net_non_interest_income_loss', 'bad_debt_expenses_and_guarantee_liability_provision', 'profit_loss_before_tax', 'paidInShares'],
  currentFormulaVersion: 1,
};
