import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankBadDebtProvisionPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'bankBadDebtProvisionPerShare',
  name: '每股呆帳費用及保證責任準備',
  nameEn: 'Bad Debt Expenses and Guarantee Liability Provision Per Share',
  unit: '元',
  formulaNote:
    '銀行業「營收到股利去了哪裡」瀑布圖扣減項——Q(單季) = 本季呆帳費用及保證責任準備' +
    '（官方單一總計欄位 bad_debt_expenses_and_guarantee_liability_provision，不拆放款/' +
    '信用卡/應收承兌票款等子科目分別相加——跟 mops-ts 來回驗證過，逐項相加疑似獨立的子' +
    '科目會漏算 adjustment 類科目，對不起來官方總計數字，改用這個官方已經算好的總計欄位' +
    '最穩健）*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。' +
    '正值代表費用支出，是瀑布圖裡從「淨收益」往下扣減的一段，不是資產負債表科目。只對' +
    '銀行/金控有資料，非銀行公司從未寫入任何一列。',
  formulaLatex: '\\mathrm{BankBadDebtProvisionPerShare} = \\frac{\\mathrm{BadDebtProvision}}{\\mathrm{Shares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E5%91%86%E5%B8%B3',
  tier: 'derived',
  sources: ['公開發行公司銀行業損益表明細（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['bad_debt_expenses_and_guarantee_liability_provision', 'paidInShares'],
  currentFormulaVersion: 1,
};
