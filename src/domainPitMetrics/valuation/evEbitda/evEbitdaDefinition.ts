import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const evEbitdaDefinition: MetricDefinitionSpec = {
  metricCode: 'evEbitda',
  displayName: 'EV/EBITDA',
  unit: '倍',
  formulaNote:
    '企業價值 = 市值+淨負債*1000；Q_ANN = 企業價值/(本季 EBITDA*4*1000)；TTM = 企業價值/' +
    '(近四季 EBITDA 加總*1000)。股價/市值查詢邏輯同 psr。獨立重新計算淨負債+EBITDA（不依賴' +
    'netDebtToEbitda 這個 metric_code 已寫入的值，公式在兩個檔案各自重複一次，延續舊架構本身' +
    '在 interestCoverage/netDebtToEbitda/roic/roce 四個檔案各自重複定義 EBIT 的既有慣例）。' +
    '沒有單季非年化版本。',
  formulaLatex:
    '\\mathrm{EvEbitda} = \\frac{\\mathrm{EV}}{\\mathrm{EBITDA}},\\quad \\mathrm{EV} = \\mathrm{MarketCap} + \\mathrm{NetDebt}',
  referenceUrl: 'https://en.wikipedia.org/wiki/EV/EBITDA',
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: [
    'shortTermBorrowings',
    'bondsPayable',
    'longterm_borrowings',
    'cash_and_cash_equivalents',
    'profit_loss_before_tax',
    'finance_costs',
    'depreciation',
    'amortization',
  ],
  currentFormulaVersion: 1,
};
