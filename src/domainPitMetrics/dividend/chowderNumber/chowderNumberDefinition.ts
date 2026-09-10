import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const chowderNumberDefinition: MetricDefinitionSpec = {
  metricCode: 'chowderNumber',
  displayName: 'Chowder Number（存股評分）',
  unit: '分',
  formulaNote:
    'Chowder Number（Seeking Alpha 社群規則）= 現金殖利率 + 股利五年成長率，門檻 ≥12%' +
    '（公用事業 8%，本服務不判定「通過/不通過」，門檻只供對照）。殖利率沿用 dividendYield' +
    '的資料源（TWSE/TPEx 官方每日公布 passthrough，取 knowledge_date 當天或之前最近一筆）；' +
    '股利五年成長率沿用 dividendGrowthRate5y 同一套現金流量近似邏輯（variant_of，不是精確' +
    '宣告股利，見 dividendGrowthRateDefinition.ts 的說明）。兩者都獨立重新計算，不依賴' +
    '已寫入的值。任一成分缺漏，整體視為缺漏，不補 0。只有 FY 一種 basis。',
  formulaLatex: '\\mathrm{Chowder} = \\mathrm{DividendYield} + \\mathrm{DividendGrowthRate}_{5y}',
  // 2026-09-10：不是學術論文，沒有維基百科條目，但使用者提供了 Chowder 本人在 Seeking Alpha
  // 的作者頁（WebSearch 交叉驗證過確有其人、確實是這個規則的提出者），比隨便一篇二手部落格
  // 轉述更接近原始出處，放 referenceUrl；academicSourceUrl 仍留空，這不是一篇可指名的論文。
  referenceUrl: 'https://seekingalpha.com/author/chowder/analysis',
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['daily_valuation.dividend_yield', 'dividendsPaid', 'paidInShares'],
  currentFormulaVersion: 1,
};
