import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const dupontEbitMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'dupontEbitMargin',
  displayName: 'EBIT 利潤率',
  unit: '%',
  formulaNote: 'Q(單季) = 本季EBIT/本季營收*100（EBIT=稅前淨利+財務費用）；TTM = 近四季EBIT加總/近四季營收加總*100。跟既有 operatingMargin（=operatingIncome/營收）是不同的數字，operatingIncome 嚴格排除非營業損益，這裡的 EBIT 只加回財務費用。',
  formulaLatex: '\\mathrm{DupontEbitMargin} = \\frac{\\mathrm{EBIT}}{\\mathrm{Revenue}} \\times 100,\\quad \\mathrm{EBIT} = \\mathrm{PretaxIncome} + \\mathrm{FinanceCosts}',
  // 沒有中文維基專屬條目，英文 Operating margin 條目明確把 "EBIT margin" 列為同義詞。
  referenceUrl: 'https://en.wikipedia.org/wiki/Operating_margin',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_before_tax', 'finance_costs', 'revenue'],
  currentFormulaVersion: 1,
};
