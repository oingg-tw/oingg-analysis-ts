import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const pFcfDefinition: MetricDefinitionSpec = {
  metricCode: 'pFcf',
  displayName: '股價自由現金流比',
  unit: '倍',
  formulaNote:
    '自由現金流 = 營業活動現金流+資本支出（資本支出來源資料是負值/流出，用加法）；Q_ANN = 市值/' +
    '(本季自由現金流*4*1000)；TTM = 市值/(近四季自由現金流加總*1000)。股價/市值查詢邏輯同 psr。' +
    '獨立重新計算自由現金流（不依賴 ocfPerShare/fcfPerShare 這兩個 metric_code 已寫入的值）。' +
    '沒有單季非年化版本。',
  formulaLatex: '\\mathrm{PFcf} = \\frac{\\mathrm{MarketCap}}{\\mathrm{FCF}}',
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures'],
  currentFormulaVersion: 1,
};
