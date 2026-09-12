import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bvpsGrowthRateDefinition: MetricDefinitionSpec = {
  metricCode: 'bvpsGrowthRate',
  name: 'BVPS 成長年增率',
  unit: '%',
  formulaNote:
    '= (本季 BVPS - 去年同季 BVPS) / |去年同季 BVPS| * 100——獨立重新計算本季/去年同季各自的' +
    'BVPS（不依賴 bvps 這個 metric_code 已寫入的值，跟 epsGrowthRate 對 eps 的既有做法一致），' +
    '流通股數各自用當下報告日對應的股本。跟 equityGrowthRate（淨值總額成長率）+ ' +
    'shareCountChangeRate（股本變化率）組成一組近似恆等式（淨值成長率 ≈ BVPS成長率 + ' +
    '股本變化率），判斷淨值增加是真的累積出來，還是被現金增資稀釋/減資買回墊高。只有 Q' +
    ' 一種 basis——資產負債表時點快照，沒有 TTM 概念（跟 bvps 自己一樣）。',
  formulaLatex: '\\mathrm{BvpsGrowthRate} = \\frac{\\mathrm{BVPS}_t - \\mathrm{BVPS}_{t-4}}{|\\mathrm{BVPS}_{t-4}|} \\times 100',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/accounting/year-over-year-yoy-analysis/',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
  currentFormulaVersion: 1,
};
