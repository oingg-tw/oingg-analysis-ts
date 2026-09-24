import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const equityMethodIncomePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'equityMethodIncomePerShare',
  name: '每股權益法投資損益',
  nameEn: 'Equity Method Income Per Share',
  unit: '元',
  formulaNote:
    'Q = 當季採用權益法認列之關聯企業及合資損益份額*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。' +
    '流通股數固定用「本季報告日」當下有效的股本。2026-09-24 為了讓「營收→股利」瀑布圖每一段都能' +
    '加總還原而新增。',
  formulaLatex: '\\mathrm{EquityMethodIncomePerShare} = \\frac{\\mathrm{EquityMethodIncome}}{\\mathrm{Shares}}',
  referenceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['share_of_profit_loss_of_associates_and_jvs', 'paidInShares'],
  currentFormulaVersion: 1,
};
