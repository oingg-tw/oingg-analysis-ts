import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const buybackYieldDefinition: MetricDefinitionSpec = {
  metricCode: 'buybackYield',
  displayName: '買回殖利率',
  unit: '%',
  formulaNote:
    'TTM = |近四季（含本季）買回庫藏股支付現金加總| / 市值（收盤價 x 流通股數，以主要季度' +
    '報告日為準）* 100。資料源是 XBRL 現金流量表長表的 payments_to_acquire_treasury_shares，' +
    '只有 XBRL 才有這個欄位，沒有舊表 fallback，回填範圍比其他現金流量表欄位更受限。近四季' +
    '任一季查無整列 XBRL 資料視為 insufficient_history（保守判斷成「還沒回填」，不是「沒買回」；' +
    '有查到那一季但沒有這個 account_code 才視為 0）。跟 dividendYield（交易所公告殖利率）' +
    '刻意分開兩個獨立指標，不合併成單一「股東總回報率」——資料源/頻率本質不同，需要的話前端' +
    '自己把兩個值加起來即可。只有 TTM 一種 basis——庫藏股買回通常不定期不定額，單季數字會' +
    '嚴重失真。',
  formulaLatex: '\\mathrm{BuybackYield} = \\frac{\\left|\\sum_{i=1}^{4}\\mathrm{BuybackCash}_i\\right|}{\\mathrm{Price}\\times\\mathrm{Shares}} \\times 100',
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['payments_to_acquire_treasury_shares', 'daily_price.close', 'paidInShares'],
  currentFormulaVersion: 1,
};
