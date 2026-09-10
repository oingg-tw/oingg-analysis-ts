import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const epsGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'epsGrowthRate',
  displayName: 'EPS 成長率（年增）',
  unit: '%',
  formulaNote:
    '= (本季 EPS - 去年同季 EPS) / |去年同季 EPS| * 100——獨立重新計算本季/去年同季各自的' +
    'EPS（不依賴 eps 這個 metric_code 已寫入的值，跟 sgr 對 roe/dividendPayoutRatio 的既有' +
    '做法一致），流通股數各自用當下報告日對應的股本。只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{EpsGrowthRate} = \\frac{\\mathrm{EPS}_t - \\mathrm{EPS}_{t-4}}{|\\mathrm{EPS}_{t-4}|} \\times 100',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
