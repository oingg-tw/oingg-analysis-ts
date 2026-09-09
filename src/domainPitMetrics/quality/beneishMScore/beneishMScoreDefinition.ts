import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const beneishMScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'beneishMScore',
  displayName: 'Beneish M-Score 財報操縱偵測分數',
  unit: '分',
  formulaNote:
    '8 變量迴歸式：M=-4.84+0.92*DSRI+0.528*GMI+0.404*AQI+0.892*SGI+0.115*DEPI-0.172*SGAI' +
    '+4.037*TATA+0.0327*LVGI，除 TATA（單期指標）外，其餘 7 個變量都是本季 vs 去年同季的' +
    '比較。只有 Q 一種 basis，去年同季取法同 piotroskiFScore。',
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
  currentFormulaVersion: 1,
};
