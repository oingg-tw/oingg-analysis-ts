import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const priceToResearchRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'priceToResearchRatio',
  name: '市值研發支出比',
  nameEn: 'Price-to-Research Ratio (PRR)',
  unit: '倍',
  formulaNote:
    '市值 / 近四季（含本季）研發支出加總。研發費用（research_and_development_expense）' +
    '只存在 XBRL 損益表寬表，舊表沒有對應欄位、沒有 fallback 可用——跟 rdIntensity 同一種' +
    '查法，直接查 mops-ts 的 quarterly_income_statement_xbrl，不走共用的' +
    'incomeStatementXbrlFirst.ts。只有 TTM 一種 basis。（2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股，已發行 − 特別股 − 庫藏股。）',
  formulaLatex: '\\mathrm{PRR} = \\frac{\\mathrm{MarketCap}}{\\mathrm{ResearchDevelopment}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Research_and_development',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '證交所／櫃買中心每日收盤價', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['research_and_development_expense', 'outstandingCommonShares', 'daily_price.close'],
  currentFormulaVersion: 2,
};
