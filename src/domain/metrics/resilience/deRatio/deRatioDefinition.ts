import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const deRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'deRatio',
  // 2026-09-21 web-nuxt 回報：原本 name「負債權益比」、unit「倍」跟公式（有息負債/權益 × 100）
  // 矛盾——寫入值一直都是百分比（2330 最新一期 13.44 = 13.44%，同期 debtRatio 30.94%/equityRatio
  // 69.06% 可對帳出總負債權益比約 0.45 倍，13.44 不可能是「倍」），前端照 unit 印會差 100 倍。
  // 只改 unit 跟 name，不動計算與寫入值（metric_values 保持 byte-identical）。改名是因為一般
  // 「負債權益比」（D/E）指總負債/權益，這支分子刻意只算有息負債（見 getDeRatioProvenance.ts），
  // 沿用 D/E 名字會讓人拿去跟別處對帳而對不上。
  name: '有息負債權益比',
  unit: '%',
  formulaNote:
    '= 有息負債(短期借款+應付公司債+長期借款)/本季期末權益*100，權益優先採歸屬母公司口徑，' +
    '缺漏退回整體口徑。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{DeRatio} = \\frac{\\mathrm{InterestBearingDebt}}{\\mathrm{Equity}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%94%A2%E6%AC%8A%E6%AF%94%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['shortTermBorrowings', 'bondsPayable', 'longterm_borrowings', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
