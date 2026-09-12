import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const evToFcfDefinition: MetricDefinitionSpec = {
  metricCode: 'evToFcf',
  name: 'EV/FCF',
  nameEn: 'EV/FCF Ratio',
  unit: '倍',
  formulaNote:
    '企業價值 = 市值+淨負債*1000；自由現金流 = 近四季（含本季）(營業活動現金流+投資性' +
    '資本支出) 加總；TTM = 企業價值/(自由現金流加總*1000)。股價/市值/淨負債查詢邏輯同' +
    'evEbitda，獨立重新計算。只有 TTM 一種 basis——單季現金流波動大，年化沒有意義。',
  formulaLatex: '\\mathrm{EvToFcf} = \\frac{\\mathrm{EV}}{\\mathrm{FCF}},\\quad \\mathrm{EV} = \\mathrm{MarketCap} + \\mathrm{NetDebt}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Free_cash_flow',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司現金流量表（XBRL）', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['shortTermBorrowings', 'bondsPayable', 'longterm_borrowings', 'cash_and_cash_equivalents', 'netCashFromOperatingActivities', 'capitalExpenditures'],
  currentFormulaVersion: 1,
};
