import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const revenuePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'revenuePerShare',
  name: '每股營收',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季營收*1000/流通股數；TTM = 近四季（含本季）營收加總*1000/流通' +
    '股數，四季不齊為 null。' +
    'FY(年報) = 年報全年金額*1000/全年加權平均流通股數（歸屬母公司淨利÷年報基本每股盈餘反推；|EPS|<0.1 不提供），座標是該年度第四季。',
  formulaLatex: '\\mathrm{RevenuePerShare} = \\frac{\\mathrm{Revenue}}{\\mathrm{Shares}}',
  referenceUrl: 'https://www.investing.com/academy/analysis/revenue-per-share-definition/',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '公開發行公司年度財務報告（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['revenue', 'paidInShares'],
  currentFormulaVersion: 1,
};
