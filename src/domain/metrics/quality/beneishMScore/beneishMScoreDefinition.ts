import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const beneishMScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'beneishMScore',
  name: 'Beneish M-Score 財報操縱偵測分數',
  unit: '分',
  formulaNote:
    '8 變量迴歸式：M=-4.84+0.92*DSRI+0.528*GMI+0.404*AQI+0.892*SGI+0.115*DEPI-0.172*SGAI' +
    '+4.037*TATA+0.0327*LVGI，除 TATA（近四季加總的 (淨利 − 營業現金流) / 本季期末總資產——2026-09-22 formulaVersion 2 起；v1 用單季分子，只有年度模型尺度的約 1/4）外，其餘 7 個變量都是本季 vs 去年同季的' +
    '比較。只有 Q 一種 basis，去年同季取法同 piotroskiFScore。',
  formulaLatex:
    '\\mathrm{M} = -4.84 + 0.92\\,\\mathrm{DSRI} + 0.528\\,\\mathrm{GMI} + 0.404\\,\\mathrm{AQI} + 0.892\\,\\mathrm{SGI} + 0.115\\,\\mathrm{DEPI} - 0.172\\,\\mathrm{SGAI} + 4.037\\,\\mathrm{TATA} + 0.0327\\,\\mathrm{LVGI}',
  academicSourceUrl: 'https://doi.org/10.2469/faj.v55.n5.2296',
  referenceUrl: 'https://en.wikipedia.org/wiki/Beneish_M-score',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: [
    'accountsReceivable',
    'revenue',
    'gross_profit',
    'current_assets',
    'property_plant_and_equipment',
    'assets',
    'depreciation',
    'sellingExpenses',
    'adminExpenses',
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'netCashFromOperatingActivities',
    'liabilities',
  ],
  currentFormulaVersion: 2,
};
