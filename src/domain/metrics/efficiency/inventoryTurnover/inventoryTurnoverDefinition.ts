import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const inventoryTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'inventoryTurnover',
  name: '存貨週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營業成本/平均存貨（次）；TTM = 近四季（含本季）營業成本' +
    '加總/平均存貨。（2026-09-22 formulaVersion 2：分母改期間平均——Q 取本季與上季期末兩點、TTM 取近四季窗口 5 個季末的平均，理由見 application/metrics/shared/averageBalances.ts；v1 用本季單一期末值。）',
  formulaLatex: '\\mathrm{InventoryTurnover} = \\frac{\\mathrm{COGS}}{\\overline{\\mathrm{Inventory}}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E5%AD%98%E8%B2%A8%E9%80%B1%E8%BD%89',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['operating_costs', 'inventories'],
  currentFormulaVersion: 2,
};
