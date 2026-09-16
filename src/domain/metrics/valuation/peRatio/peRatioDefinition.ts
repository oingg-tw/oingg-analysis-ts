import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

  // 2026-09-07 新增：本益比/本淨比。獨立重新算 EPS(TTM)/BVPS(Q)，不呼叫 eps/bvps 已寫入的
  // metric_value，維持每條 pipeline 獨立的原則——但公式跟這兩支完全相同，保證口徑一致，
  // 前端同時顯示這三個 metric_code 不會有數字兜不起來的問題。股價用 getStockPriceAsOf
  // (knowledge_date) 查，跟 fcfYield/psr/pFcf/evEbitda 同一個模式。
export const peRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'peRatio',
  name: 'PER',
  unit: '倍',
  formulaNote:
    '= 股價(knowledge_date當天或之前最近一筆收盤價) / EPS(TTM，近四季淨利加總*1000/流通股數)。' +
    '只有 TTM 一種 basis——台股慣例的本益比就是用近四季 EPS。EPS_TTM 剛好等於 0 才是 null' +
    '（zero_or_negative_denominator），為負仍計算出真實但為負的本益比，不隱藏。',
  formulaLatex: '\\mathrm{PE} = \\frac{\\mathrm{Price}}{\\mathrm{EPS}_{\\mathrm{TTM}}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%9C%AC%E7%9B%8A%E6%AF%94',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
