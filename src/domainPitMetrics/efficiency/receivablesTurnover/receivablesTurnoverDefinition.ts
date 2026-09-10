import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const receivablesTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'receivablesTurnover',
  displayName: '應收帳款週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營收/本季期末應收帳款（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營收加總/' +
    '本季期末應收帳款。',
  formulaLatex: '\\mathrm{ReceivablesTurnover} = \\frac{\\mathrm{Revenue}}{\\mathrm{AccountsReceivable}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%87%89%E6%94%B6%E5%B8%B3%E6%AC%BE%E9%80%B1%E8%BD%89%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['revenue', 'accountsReceivable'],
  currentFormulaVersion: 1,
};
