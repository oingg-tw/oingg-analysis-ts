import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const operatingMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingMargin',
  name: '營業利益率',
  unit: '%',
  // 金融業不適用改在 computeMarginsFamily 判斷（保險業有替代科目，對它們適用），不用 notApplicableToFinancialIndustry。
  formulaNote:
    'Q(單季) = 本季營業利益/本季營收*100；TTM = 近四季（含本季）營業利益加總/近四季營收加總*100。' +
    '沒有 Q_ANN。' +
    '（2026-10-04 新增）FY(年度) = 年報全年營業利益/全年營業收入*100，跟證交所營益分析的營業利益率同一個算法；座標是該年度第四季。',
  formulaLatex: '\\mathrm{OperatingMargin} = \\frac{\\mathrm{OperatingIncome}}{\\mathrm{Revenue}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Operating_margin',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '保險業損益明細表（XBRL，保險業適用）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['operatingIncome', 'revenue'],
  currentFormulaVersion: 1,
};
