import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const fixedAssetTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'fixedAssetTurnover',
  name: '固定資產週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營收/平均不動產、廠房及設備（次）；TTM = 近四季（含本季）' +
    '營收加總/平均不動產、廠房及設備。（2026-09-22 formulaVersion 2：分母改期間平均——Q 取本季與上季期末兩點、TTM 取近四季窗口 5 個季末的平均，理由見 application/metrics/shared/averageBalances.ts；v1 用本季單一期末值。）',
  formulaLatex: '\\mathrm{FixedAssetTurnover} = \\frac{\\mathrm{Revenue}}{\\overline{\\mathrm{PPE}}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Fixed_asset_turnover',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['revenue', 'property_plant_and_equipment'],
  currentFormulaVersion: 2,
};
