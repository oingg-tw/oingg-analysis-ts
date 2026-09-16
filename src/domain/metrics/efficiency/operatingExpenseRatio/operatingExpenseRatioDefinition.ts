import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const operatingExpenseRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingExpenseRatio',
  name: '營業費用率',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季營業費用(推銷費用+管理費用)/本季營收*100；TTM = 近四季（含本季）加總/' +
    '近四季營收加總*100。只用推銷+管理費用，不含研發費用（損益表沒有獨立的研發費用欄位），' +
    '是 Beneish M-Score SGAI 概念的水準版。沒有 Q_ANN，跟 grossMargin/operatingMargin 同一種' +
    '設計。',
  formulaLatex: '\\mathrm{OperatingExpenseRatio} = \\frac{\\mathrm{SellingExpense} + \\mathrm{AdminExpense}}{\\mathrm{Revenue}} \\times 100',
  // 中文維基「經營比率」條目涵蓋營業費用/營收的概念，比較廣義（不是嚴格限定推銷+管理），
  // 但是查證過確實有定義營業費用率、是目前找得到最接近的中文條目。
  referenceUrl: 'https://zh.wikipedia.org/wiki/%E7%B6%93%E7%87%9F%E6%AF%94%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['selling_expense', 'administrative_expense', 'revenue'],
  currentFormulaVersion: 1,
};
