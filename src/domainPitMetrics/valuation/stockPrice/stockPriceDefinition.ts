import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 2026-09-07 web-nuxt 要求：peRatio/pbRatio 河流圖需要「該期實際用來算比率的股價」
  // 本身，不要用 peRatio×eps 反推（見 computeStockPricePit.ts 檔頭說明）。只有 Q 一種
  // basis——股價本身沒有 TTM/年化概念，knowledge_date 解析只用資產負債表（跟 bvps 一致，
  // 保證跟 pbRatio 完全同步；跟 peRatio 絕大多數情況一致但沒有數學保證）。
export const stockPriceDefinition: MetricDefinitionSpec = {
  metricCode: 'stockPrice',
  displayName: '股價',
  unit: '元',
  formulaNote: '= knowledge_date 當天或之前最近一筆收盤價（新台幣元）。查無股價資料時為 null（missing_input）。knowledge_date 解析只用資產負債表，不查損益表。',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E5%83%B9',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: [],
  currentFormulaVersion: 1,
};
