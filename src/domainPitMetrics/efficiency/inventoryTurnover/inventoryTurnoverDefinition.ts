import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const inventoryTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'inventoryTurnover',
  displayName: '存貨週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營業成本/本季期末存貨（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營業成本' +
    '加總/本季期末存貨。',
  formulaLatex: '\\mathrm{InventoryTurnover} = \\frac{\\mathrm{COGS}}{\\mathrm{Inventory}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E5%AD%98%E8%B2%A8%E9%80%B1%E8%BD%89',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['operating_costs', 'inventories'],
  currentFormulaVersion: 1,
};
