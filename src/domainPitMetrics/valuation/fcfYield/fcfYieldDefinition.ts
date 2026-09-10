import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const fcfYieldDefinition: MetricDefinitionSpec = {
  metricCode: 'fcfYield',
  displayName: '自由現金流殖利率',
  unit: '%',
  formulaNote:
    'Q_ANN = 每股 FCF 單季年化 / 股價 * 100；TTM = 每股 FCF(TTM) / 股價 * 100。股價取這個座標' +
    '解析出來的 knowledge_date 當天（或之前最近一筆交易日）收盤價——跟財報公告日共用同一個' +
    'knowledge_date，不是另外設計一套「股價要取哪一天」的機制。獨立重新計算每股 FCF（不依賴' +
    'ocfPerShare/fcfPerShare 這兩個 metric_code 已寫入的值）。沒有單季非年化版本（跟舊架構' +
    '一致，是 P_FCF 估值倍數的倒數）。',
  formulaLatex: '\\mathrm{FcfYield} = \\frac{\\mathrm{FcfPerShare}}{\\mathrm{Price}} \\times 100',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures', 'paidInShares'],
  currentFormulaVersion: 1,
};
