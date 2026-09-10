import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const ocfPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'ocfPerShare',
  displayName: '每股營業現金流',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季營業活動現金流*1000/流通股數；Q_ANN = Q*4；TTM = 近四季（含本季）營業活動' +
    '現金流加總*1000/流通股數，四季不齊為 null。',
  formulaLatex: '\\mathrm{OcfPerShare} = \\frac{\\mathrm{CFO}}{\\mathrm{Shares}}',
  // 沒有每股專屬條目，中文維基「現金流量表」條目涵蓋營業活動現金流概念。
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%8F%BE%E9%87%91%E6%B5%81%E9%87%8F%E8%A1%A8',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'paidInShares'],
  currentFormulaVersion: 1,
};
