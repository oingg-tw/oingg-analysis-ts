import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const fixedAssetTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'fixedAssetTurnover',
  name: '固定資產週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營收/本季期末不動產、廠房及設備（次）；Q_ANN = Q*4；TTM = 近四季（含本季）' +
    '營收加總/本季期末不動產、廠房及設備。',
  formulaLatex: '\\mathrm{FixedAssetTurnover} = \\frac{\\mathrm{Revenue}}{\\mathrm{PPE}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Fixed_asset_turnover',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['revenue', 'property_plant_and_equipment'],
  currentFormulaVersion: 1,
};
