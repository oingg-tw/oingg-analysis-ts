import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const inventoryDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'inventoryDays',
  name: '存貨週轉天數',
  unit: '天',
  notApplicableToFinancialIndustry: true,
  formulaNote:
    'DIO = 365/存貨周轉率（TTM）。不能直接拿 365/單季周轉率——那算出來是' +
    '「一季裡的天數」，不是有意義的週轉天數，週轉天數的定義本來就以一年為基準。（2026-09-22 formulaVersion 2：上游週轉率的分母改成期間平均，這支跟著換版；公式本身不變。）' +
    '（2026-10-05 新增）Q(單季)：一季以 365/4 天計，用單季週轉率換算（= 365 ÷（單季週轉率×4）），跟 TTM 同一把尺；溯源表是近四季。',
  formulaLatex: '\\mathrm{DIO} = \\frac{365}{\\mathrm{InventoryTurnover}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Days_in_inventory',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['operating_costs', 'inventories'],
  currentFormulaVersion: 2,
};
