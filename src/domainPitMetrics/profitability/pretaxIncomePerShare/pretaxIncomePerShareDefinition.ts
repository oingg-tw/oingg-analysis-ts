import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const pretaxIncomePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'pretaxIncomePerShare',
  name: '每股稅前淨利',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季稅前淨利*1000/流通股數（股本歷史生效日<=本季報告日的最新一筆）；' +
    'TTM = 近四季（含本季）稅前淨利加總*1000/流通股數，四季不齊為 null。流通股數固定用' +
    '「本季報告日」當下有效的股本，Q/TTM 共用同一個股數（跟 eps 一致）。',
  formulaLatex: '\\mathrm{PretaxIncomePerShare} = \\frac{\\mathrm{ProfitBeforeTax}}{\\mathrm{Shares}}',
  // 沒有每股專屬條目，中文維基「稅前淨利」條目涵蓋稅前淨利本體概念。
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%A8%85%E5%89%8D%E6%B7%A8%E5%88%A9',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_before_tax', 'paidInShares'],
  currentFormulaVersion: 1,
};
