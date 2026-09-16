import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-10 使用者要求：NCAV 的門檻比較要改成「總額 vs 總額」（Net Current Asset Value
// vs Market Capitalization，見 https://en.wikipedia.org/wiki/Net_current_asset_value），
// 不要用每股 NCAV vs 每股股價這種隱含除以股數的寫法。既有 badge.threshold.compareAgainstFieldId
// 只能指向另一支已註冊的 metricCode，市值本來只是 @/models/twse/marketCap.ts 裡給
// evEbitda/pFcf/psr/earningsYield/fcfYield/altmanZScore/buybackYield 內部使用的計算結果，
// 沒有自己的 metric_code，故新增這支獨立指標。knowledge_date 解析比照 stockPrice（只用
// 資產負債表），保證跟 stockPrice/bvps/pbRatio/ncav 同步。只有 Q 一種 basis——市值本身
// 沒有 TTM/年化概念。
export const marketCapDefinition: MetricDefinitionSpec = {
  metricCode: 'marketCap',
  name: '市值',
  unit: '元',
  formulaNote: '= knowledge_date 當天或之前最近一筆收盤價 × 當時流通股數（新台幣元）。查無股價或股本資料時為 null（missing_input）。',
  formulaLatex: '\\mathrm{MarketCap} = \\mathrm{Price} \\times \\mathrm{SharesOutstanding}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Market_capitalization',
  tier: 'derived',
  sources: ['證交所／櫃買中心每日收盤價', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: [],
  currentFormulaVersion: 1,
};
