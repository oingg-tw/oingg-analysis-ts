import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const ocfPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'ocfPerShare',
  name: '每股營業現金流',
  unit: '元',
  perShare: true,
  formulaNote:
    'Q(單季) = 本季營業活動現金流*1000/流通股數；TTM = 近四季（含本季）營業活動' +
    '現金流加總*1000/流通股數，四季不齊為 null。（2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股，已發行 − 特別股 − 庫藏股。）',
  formulaLatex: '\\mathrm{OcfPerShare} = \\frac{\\mathrm{CFO}}{\\mathrm{Shares}}',
  // 沒有每股專屬條目，中文維基「現金流量表」條目涵蓋營業活動現金流概念。
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%8F%BE%E9%87%91%E6%B5%81%E9%87%8F%E8%A1%A8',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'outstandingCommonShares'],
  currentFormulaVersion: 2,
};
