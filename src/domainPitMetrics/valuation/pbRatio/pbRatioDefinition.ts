import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const pbRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'pbRatio',
  displayName: '股價淨值比',
  unit: '倍',
  formulaNote:
    '= 股價(knowledge_date當天或之前最近一筆收盤價) / BVPS(本季期末權益*1000/流通股數)。只有 Q' +
    ' 一種 basis——跟 bvps 自己一樣是資產負債表時點快照，沒有 TTM/年化概念。BVPS 剛好等於 0' +
    ' 才是 null（zero_or_negative_denominator），為負（資不抵債）仍計算出真實但為負的本淨比。',
  formulaLatex: '\\mathrm{PB} = \\frac{\\mathrm{Price}}{\\mathrm{BVPS}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E5%83%B9%E6%B7%A8%E5%80%BC%E6%AF%94',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
  currentFormulaVersion: 1,
};
