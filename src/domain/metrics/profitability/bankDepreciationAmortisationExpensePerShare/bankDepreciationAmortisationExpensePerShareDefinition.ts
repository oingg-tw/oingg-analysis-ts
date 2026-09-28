import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-28 銀行／金控營業費用三分拆（使用者：「做」）：營業費用 = 員工福利 + 折舊及攤銷 + 其他業務及管理費用，
// 三支加總還原營業費用合計（operatingExpensePerShare）。只有銀行與金控的申報格式有這組科目（mops-ts 查 taxonomy：
// 一般業、保險沒有這兩個科目，券商的母項是「支出及費用合計」、15 個子科目，語意不同），其他公司從未寫入任何一列。
export const bankDepreciationAmortisationExpensePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'bankDepreciationAmortisationExpensePerShare',
  name: '每股折舊及攤銷費用',
  nameEn: 'Depreciation and Amortisation Expense Per Share (Banks & Financial Holdings)',
  unit: '元',
  perShare: true,
  formulaNote:
    'Q(單季) = 本季折舊及攤銷費用（depreciation_and_amortisation_expense）*1000/流通在外普通股；TTM = 近四季（含本季）加總*1000/流通在外普通股，' +
    '四季任一季三個成分不齊為 null。只對銀行與金融控股公司有資料；金控是全集團合併數（含旗下保險、證券）。',
  formulaLatex: '\\mathrm{BankDepreciationAmortisationExpensePerShare} = \\frac{\\mathrm{DepreciationAmortisation}}{\\mathrm{Shares}}',
  tier: 'derived',
  sources: ['公開發行公司銀行業損益表明細（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['depreciation_and_amortisation_expense', 'outstandingCommonShares'],
  currentFormulaVersion: 1,
};
