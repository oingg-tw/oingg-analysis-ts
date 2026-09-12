import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const evToEbitDefinition: MetricDefinitionSpec = {
  metricCode: 'evToEbit',
  name: 'EV/EBIT',
  nameEn: "Acquirer's Multiple",
  unit: '倍',
  formulaNote:
    '企業價值 = 市值+淨負債*1000；EBIT = 稅前淨利+財務成本（不像 EV/EBITDA 那樣加回折舊' +
    '攤銷）；Q_ANN = 企業價值/(本季 EBIT*4*1000)；TTM = 企業價值/(近四季 EBIT 加總*1000)。' +
    '股價/市值/淨負債查詢邏輯同 evEbitda，獨立重新計算（不依賴 evEbitda/interestCoverage' +
    '已寫入的值，延續舊架構在多個檔案各自重複定義 EBIT 的既有慣例）。沒有單季非年化版本。',
  formulaLatex: '\\mathrm{EvToEbit} = \\frac{\\mathrm{EV}}{\\mathrm{EBIT}},\\quad \\mathrm{EV} = \\mathrm{MarketCap} + \\mathrm{NetDebt}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Earnings_yield#Acquirer%27s_Multiple',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['shortTermBorrowings', 'bondsPayable', 'longterm_borrowings', 'cash_and_cash_equivalents', 'profit_loss_before_tax', 'finance_costs'],
  currentFormulaVersion: 1,
};
