import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const receivablesTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'receivablesTurnover',
  name: '應收帳款週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營收/平均應收帳款（次）；TTM = 近四季（含本季）營收加總/' +
    '平均應收帳款。（2026-09-22 formulaVersion 2：分母改期間平均——Q 取本季與上季期末兩點、TTM 取近四季窗口 5 個季末的平均，理由見 application/metrics/shared/averageBalances.ts；v1 用本季單一期末值。）',
  formulaLatex: '\\mathrm{ReceivablesTurnover} = \\frac{\\mathrm{Revenue}}{\\overline{\\mathrm{AccountsReceivable}}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%87%89%E6%94%B6%E5%B8%B3%E6%AC%BE%E9%80%B1%E8%BD%89%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['revenue', 'accountsReceivable'],
  currentFormulaVersion: 2,
};
