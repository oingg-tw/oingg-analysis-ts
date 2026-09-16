import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const netProfitMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'netProfitMargin',
  name: '稅後淨利率',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季淨利/本季營收*100，淨利優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
    'TTM = 近四季（含本季）淨利加總/近四季營收加總*100，四季不齊為 null。' +
    '沒有 Q_ANN——flow/flow 比率年化沒有意義（跟 src/domainMetrics/margins.ts 現有規則一致）。',
  formulaLatex: '\\mathrm{NetProfitMargin} = \\frac{\\mathrm{NetIncome}}{\\mathrm{Revenue}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%B7%A8%E5%88%A9%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'revenue'],
  currentFormulaVersion: 1,
};
