import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const epsGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'epsGrowthRate',
  name: 'EPS 成長年增率',
  unit: '%',
  formulaNote:
    '= (本季 EPS - 去年同季 EPS) / |去年同季 EPS| * 100——獨立重新計算本季/去年同季各自的' +
    'EPS（不依賴 eps 這個 metric_code 已寫入的值，跟 sgr 對 roe/dividendPayoutRatio 的既有' +
    '做法一致），流通股數各自用當下報告日對應的股本。只有 Q 一種 basis。（2026-09-22 formulaVersion 2：中繼的每股值改用不四捨五入的精確值，只在最後結果四捨五入一次；v1 拿已進位到分的 EPS/BVPS 再算，小 EPS 公司失真。）',
  formulaLatex: '\\mathrm{EpsGrowthRate} = \\frac{\\mathrm{EPS}_t - \\mathrm{EPS}_{t-4}}{|\\mathrm{EPS}_{t-4}|} \\times 100',
  referenceUrl: 'https://www.wallstreetprep.com/knowledge/eps-growth/',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 2,
};
