import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const fcfPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'fcfPerShare',
  name: '每股自由現金流',
  unit: '元',
  formulaNote:
    'FCF = 營業活動現金流 + 資本支出（資本支出在來源資料是負值/流出，用加法，不是減法）；' +
    'Q(單季) = 本季 FCF*1000/流通股數；TTM = 近四季（含本季）FCF 加總*1000/流通' +
    '股數，四季不齊為 null。',
  formulaLatex: '\\mathrm{FcfPerShare} = \\frac{\\mathrm{CFO} + \\mathrm{Capex}}{\\mathrm{Shares}}',
  // 沒有每股專屬條目，中文維基「自由現金流量」條目涵蓋 FCF 本體概念。
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%87%AA%E7%94%B1%E7%8F%BE%E9%87%91%E6%B5%81%E9%87%8F',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures', 'paidInShares'],
  currentFormulaVersion: 1,
};
