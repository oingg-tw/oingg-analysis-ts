import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const operatingExpenseRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingExpenseRatio',
  displayName: '營業費用率',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季營業費用(推銷費用+管理費用)/本季營收*100；TTM = 近四季（含本季）加總/' +
    '近四季營收加總*100。只用推銷+管理費用，不含研發費用（損益表沒有獨立的研發費用欄位），' +
    '是 Beneish M-Score SGAI 概念的水準版。沒有 Q_ANN，跟 grossMargin/operatingMargin 同一種' +
    '設計。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['selling_expense', 'administrative_expense', 'revenue'],
  currentFormulaVersion: 1,
};
