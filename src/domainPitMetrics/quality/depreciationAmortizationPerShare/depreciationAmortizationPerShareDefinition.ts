import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const depreciationAmortizationPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'depreciationAmortizationPerShare',
  name: '每股折舊攤銷',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季（折舊費用+攤銷費用）*1000/流通股數；TTM = 近四季（含本季）折舊攤銷' +
    '加總*1000/流通股數，四季不齊為 null。折舊/攤銷來源欄位跟 evEbitda/netDebtToEbitda ' +
    '算 EBITDA 時用的完全一致。',
  formulaLatex: '\\mathrm{DepreciationAmortizationPerShare} = \\frac{\\mathrm{Depreciation} + \\mathrm{Amortization}}{\\mathrm{Shares}}',
  // 沒有每股專屬條目，中文維基「折舊」「攤銷（會計學）」兩個條目分別涵蓋，這裡取折舊條目當代表。
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%8A%98%E8%88%8A',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['adj_depreciation_expense', 'adj_amortisation_expense', 'paidInShares'],
  currentFormulaVersion: 1,
};
