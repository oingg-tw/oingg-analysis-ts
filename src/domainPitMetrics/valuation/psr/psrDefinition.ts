import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const psrDefinition: MetricDefinitionSpec = {
  metricCode: 'psr',
  displayName: '股價營收比',
  unit: '倍',
  formulaNote:
    'Q_ANN = 市值/(本季營收*4*1000)；TTM = 市值/(近四季營收加總*1000)。市值取這個座標解析出來的' +
    'knowledge_date 當天（或之前最近一筆交易日）市值——跟財報公告日共用同一個 knowledge_date。' +
    '獨立重新計算營收（不依賴 revenuePerShare 這個 metric_code 已寫入的值）。沒有單季非年化版本' +
    '（store/flow 比率）。',
  formulaLatex: '\\mathrm{PSR} = \\frac{\\mathrm{MarketCap}}{\\mathrm{Revenue}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E5%83%B9%E7%87%9F%E6%94%B6%E6%AF%94',
  tier: 'derived',
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['revenue'],
  currentFormulaVersion: 1,
};
