import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

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
  formulaLatex:
    '\\mathrm{O} = -1.32 - 0.407\\,\\mathrm{SIZE} + 6.03\\,\\mathrm{TLTA} - 1.43\\,\\mathrm{WCTA} + 0.0757\\,\\mathrm{CLCA} - 1.72\\,\\mathrm{OENEG} - 2.37\\,\\mathrm{NITA} - 1.83\\,\\mathrm{FUTL} + 0.285\\,\\mathrm{INTWO} - 0.521\\,\\mathrm{CHIN}',
  academicSourceUrl: 'https://doi.org/10.2307/2490395',
  referenceUrl: 'https://en.wikipedia.org/wiki/Ohlson_O-score',
  tier: 'composite',
  badge: {
    id: 'ohlson-o-score',
    name: 'Ohlson O-Score',
    nameEn: 'Ohlson O-Score',
    author: 'James Ohlson, 1980',
    summary: '用邏輯迴歸模型估計企業陷入財務困境的機率。',
    detail:
      '紐約大學會計學教授 James Ohlson 於 1980 年發表，是財務危機預測領域除了 Altman Z-Score 外另一個常被' +
      '引用的模型。與 Z-Score 用加權加總的做法不同，O-Score 用邏輯迴歸（logistic regression）方式，將公司' +
      '規模、負債比、營運資金比率、流動比率、獲利能力、現金流量等 9 項財務因子代入模型，直接估計出一個' +
      '「陷入財務困境」的機率值。同樣是根據歷史樣本建立的統計模型，反映的是統計上的關聯性。',
    token: 'TTM',
    threshold: { description: '< 0.5（機率模型的標準判別界線）', denominator: 1, comparator: 'lt', value: 0.5 },
  },
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
