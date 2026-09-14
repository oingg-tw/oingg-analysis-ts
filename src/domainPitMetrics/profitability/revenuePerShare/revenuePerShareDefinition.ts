import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const revenuePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'revenuePerShare',
  name: '每股營收',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季營收*1000/流通股數；TTM = 近四季（含本季）營收加總*1000/流通' +
    '股數，四季不齊為 null。',
  formulaLatex: '\\mathrm{RevenuePerShare} = \\frac{\\mathrm{Revenue}}{\\mathrm{Shares}}',
  referenceUrl: 'https://www.investing.com/academy/analysis/revenue-per-share-definition/',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['revenue', 'paidInShares'],
  currentFormulaVersion: 1,
};
