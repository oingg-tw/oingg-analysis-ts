import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const otherGainsLossesPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'otherGainsLossesPerShare',
  name: '每股其他利益及損失',
  nameEn: 'Other Gains and Losses Per Share',
  unit: '元',
  formulaNote:
    'Q = 當季其他利益及損失（other_gains_losses）*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。' +
    '流通股數固定用「本季報告日」當下有效的股本。2026-09-24 為了讓「營收→股利」瀑布圖每一段都能' +
    '加總還原而新增。',
  formulaLatex: '\\mathrm{OtherGainsLossesPerShare} = \\frac{\\mathrm{OtherGainsLosses}}{\\mathrm{Shares}}',
  referenceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['other_gains_losses', 'paidInShares'],
  currentFormulaVersion: 1,
};
