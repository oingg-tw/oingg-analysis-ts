import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const inventoryDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'inventoryDays',
  displayName: '存貨週轉天數 (DIO)',
  unit: '天',
  formulaNote:
    'DIO = 365/存貨周轉率（年化或 TTM）。只有 Q_ANN/TTM 兩種 basis——365/單季周轉率算出來是' +
    '「一季裡的天數」，不是有意義的週轉天數，週轉天數的定義本來就以一年為基準。',
  formulaLatex: '\\mathrm{DIO} = \\frac{365}{\\mathrm{InventoryTurnover}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Days_in_inventory',
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['operating_costs', 'inventories'],
  currentFormulaVersion: 1,
};
