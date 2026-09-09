import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const ohlsonOScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'ohlsonOScore',
  displayName: 'Ohlson O-Score 財務危機預警分數',
  unit: '分',
  formulaNote:
    '9 變量 Logit 模型：SIZE=ln(總資產)、TLTA=總負債/總資產、WCTA=(流動資產-流動負債)/總資產、' +
    'CLCA=流動負債/流動資產、OENEG=總負債>總資產?1:0、NITA=淨利(TTM)/總資產、' +
    'FUTL=營運現金流(TTM)/總負債、INTWO=今年及去年TTM淨利皆為負?1:0、' +
    'CHIN=(今年TTM淨利-去年TTM淨利)/(|今年|+|去年|)。INTWO/CHIN 需要「今年 TTM vs 去年同季' +
    'TTM」比較——去年同季 TTM 窗口用 getPastNQuarters n=5 取錨點、再從錨點往前抓 4 季建窗口，' +
    '不是新機制。只有 TTM 一種 basis。',
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'assets',
    'liabilities',
    'current_assets',
    'current_liabilities',
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'netCashFromOperatingActivities',
  ],
  currentFormulaVersion: 1,
};
