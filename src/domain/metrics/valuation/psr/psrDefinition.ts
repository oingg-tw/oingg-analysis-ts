import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const psrDefinition: MetricDefinitionSpec = {
  metricCode: 'psr',
  name: '股價營收比',
  unit: '倍',
  formulaNote:
    'TTM = 市值/(近四季營收加總*1000)。市值取這個座標解析出來的' +
    'knowledge_date 當天（或之前最近一筆交易日）市值——跟財報公告日共用同一個 knowledge_date。' +
    '獨立重新計算營收（不依賴 revenuePerShare 這個 metric_code 已寫入的值）。沒有單季非年化版本' +
    '（store/flow 比率）。',
  formulaLatex: '\\mathrm{PSR} = \\frac{\\mathrm{MarketCap}}{\\mathrm{Revenue}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E5%83%B9%E7%87%9F%E6%94%B6%E6%AF%94',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['revenue'],
  currentFormulaVersion: 1,
};
