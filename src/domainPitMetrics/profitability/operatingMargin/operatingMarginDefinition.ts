import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const operatingMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingMargin',
  displayName: '營業利益率',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季營業利益/本季營收*100；TTM = 近四季（含本季）營業利益加總/近四季營收加總*100。' +
    '沒有 Q_ANN。',
  formulaLatex: '\\mathrm{OperatingMargin} = \\frac{\\mathrm{OperatingIncome}}{\\mathrm{Revenue}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Operating_margin',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '保險業損益明細表（XBRL，保險業適用）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['operatingIncome', 'revenue'],
  currentFormulaVersion: 1,
};
