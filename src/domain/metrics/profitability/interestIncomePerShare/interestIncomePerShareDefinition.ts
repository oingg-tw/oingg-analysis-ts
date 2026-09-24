import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const interestIncomePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'interestIncomePerShare',
  name: '每股利息收入',
  nameEn: 'Interest Income Per Share',
  unit: '元',
  formulaNote:
    'Q = 當季利息收入（revenue_from_interest）*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。' +
    '流通股數固定用「本季報告日」當下有效的股本。2026-09-24 為了讓「營收→股利」瀑布圖每一段都能' +
    '加總還原而新增。',
  formulaLatex: '\\mathrm{InterestIncomePerShare} = \\frac{\\mathrm{InterestIncome}}{\\mathrm{Shares}}',
  referenceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['revenue_from_interest', 'paidInShares'],
  currentFormulaVersion: 1,
};
