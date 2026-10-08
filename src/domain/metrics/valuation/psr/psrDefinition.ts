import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const psrDefinition: MetricDefinitionSpec = {
  metricCode: 'psr',
  name: '股價營收比',
  unit: '倍',
  // 2026-10-08 補上（web-nuxt 回報）：金融股損益表沒有一般意義的營業收入，原本被標成 insufficient_history，讀者會以為「以後會有」。
  // 同日稍後純銀行改用銀行口徑照算（application/metrics/shared/bankAwareIncome.ts），這個旗標只剩金控、保險等算不出來的會改標不適用。
  notApplicableToFinancialIndustry: 'exceptBanks',
  formulaNote:
    'TTM = 市值/(近四季營收加總*1000)。市值取這個座標解析出來的' +
    'knowledge_date 當天（或之前最近一筆交易日）市值——跟財報公告日共用同一個 knowledge_date。' +
    '獨立重新計算營收（不依賴 revenuePerShare 這個 metric_code 已寫入的值）。沒有單季非年化版本' +
    '（store/flow 比率）。（2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股，已發行 − 特別股 − 庫藏股。）',
  formulaLatex: '\\mathrm{PSR} = \\frac{\\mathrm{MarketCap}}{\\mathrm{Revenue}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E5%83%B9%E7%87%9F%E6%94%B6%E6%AF%94',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '證交所／櫃買中心每日收盤價', '銀行業損益表明細（XBRL，銀行適用）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['revenue'],
  currentFormulaVersion: 2,
};
