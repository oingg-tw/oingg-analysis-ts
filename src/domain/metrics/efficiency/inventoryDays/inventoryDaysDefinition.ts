import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const inventoryDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'inventoryDays',
  name: '存貨週轉天數',
  unit: '天',
  formulaNote:
    'DIO = 365/存貨周轉率（TTM）。只有 TTM 一種 basis——365/單季周轉率算出來是' +
    '「一季裡的天數」，不是有意義的週轉天數，週轉天數的定義本來就以一年為基準。（2026-09-22 formulaVersion 2：上游週轉率的分母改成期間平均，這支跟著換版；公式本身不變。）',
  formulaLatex: '\\mathrm{DIO} = \\frac{365}{\\mathrm{InventoryTurnover}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Days_in_inventory',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['operating_costs', 'inventories'],
  currentFormulaVersion: 2,
};
