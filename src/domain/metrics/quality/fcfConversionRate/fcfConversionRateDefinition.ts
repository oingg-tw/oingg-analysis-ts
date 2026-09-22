import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——「FCF 轉換率」
// 業界有多種定義（FCF/OCF、FCF/EBITDA、FCF/NetIncome），這裡明確採用 FCF/NetIncome
// （衡量帳面獲利有多少比例真的轉換成自由現金流），不是另外兩種版本。只有 TTM 一種 basis。
export const fcfConversionRateDefinition: MetricDefinitionSpec = {
  metricCode: 'fcfConversionRate',
  name: 'FCF 轉換率',
  unit: '%',
  formulaNote:
    '= 近四季自由現金流（OCF-資本支出）加總 ÷ 近四季淨利加總，衡量帳面獲利有多少比例真的轉換成自由現金流。' +
    '「FCF 轉換率」業界有多種定義（FCF/OCF、FCF/EBITDA、FCF/NetIncome），這裡採用 FCF/NetIncome 版本。近四季淨利 ≤ 0 時不計算（zero_or_negative_denominator，2026-09-22 起；虧損時「轉換率」符號翻轉無意義）。',
  formulaLatex: '\\mathrm{FCF\\ Conversion} = \\dfrac{\\mathrm{FCF}_{\\mathrm{TTM}}}{\\mathrm{NetIncome}_{\\mathrm{TTM}}}',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss', 'cash_flows_from_used_in_operating_activities', 'purchase_of_ppe_investing'],
  currentFormulaVersion: 1,
};
