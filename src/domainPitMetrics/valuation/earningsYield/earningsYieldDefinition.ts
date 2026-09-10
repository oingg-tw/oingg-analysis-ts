import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const earningsYieldDefinition: MetricDefinitionSpec = {
  metricCode: 'earningsYield',
  displayName: '盈餘收益率',
  unit: '%',
  formulaNote:
    '= EPS(TTM) / 股價(knowledge_date 當天或之前最近一筆收盤價) * 100，是本益比的倒數換算成' +
    '百分比呈現。獨立重新計算 EPS_TTM/股價（不依賴 eps/peRatio 已寫入的值，跟 sgr 對 roe 的' +
    '既有做法一致）。EPS_TTM 為負仍計算出真實但為負的值，不隱藏成 null（跟 peRatio 虧損時' +
    '本益比為負同一個判斷）。只有 TTM 一種 basis，跟 peRatio 一致。',
  formulaLatex: '\\mathrm{EarningsYield} = \\frac{\\mathrm{EPS}_{\\mathrm{TTM}}}{\\mathrm{Price}} \\times 100',
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares', 'daily_price.close'],
  currentFormulaVersion: 1,
};
